import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isUniqueViolation, toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { toProductRow, type ProductFormValues } from '@/lib/productForm'
import { supabase } from '@/lib/supabase'

/**
 * Product writes (DSK-205, DSK-207, DSK-209, DSK-210, DSK-218).
 *
 * Products are written through the table, not an RPC — unlike stock. That is not an
 * inconsistency: rule 0.2 forbids direct writes to `stock_ledger` / `stock_balances` because
 * stock needs locking, validation and an audit trail that a client cannot be trusted with.
 * A product row has none of that; `products_write` RLS already restricts it to ADMIN and
 * STORE_MANAGER, and `tg_set_audit` stamps created_by/updated_by from the JWT server-side.
 */

/** Raised when the pasted barcode already belongs to another product (SRD §4, DSK-210). */
export class DuplicateBarcodeError extends Error {
  constructor(public readonly code: string) {
    super(`DUPLICATE_BARCODE: ${code}`)
    this.name = 'DuplicateBarcodeError'
  }
}

/**
 * Raised when the product saved but its manufacturer barcode did not.
 *
 * This is a genuinely partial outcome and it is reported rather than hidden. PostgREST gives
 * no transaction across two statements, so the product insert and the barcode insert cannot
 * be atomic without an RPC. The product itself is complete and usable — it always has its own
 * generated ST-code — so the honest thing is to say the alias is missing and let the user add
 * it again, not to delete a valid product behind their back.
 */
export class BarcodeNotLinkedError extends Error {
  constructor(
    public readonly productId: string,
    public readonly code: string
  ) {
    super(`BARCODE_NOT_LINKED: ${code}`)
    this.name = 'BarcodeNotLinkedError'
  }
}

/**
 * Checks whether a barcode is free before we try to use it.
 *
 * @throws DuplicateBarcodeError when the code already exists.
 *
 * This is a courtesy, not the guarantee: two clerks can pass this check in the same
 * millisecond and only `uq_product_barcode_code` decides. Its job is to turn the common case
 * into a clear message on the field instead of a failed save.
 */
async function assertBarcodeFree(code: string): Promise<void> {
  const { data, error } = await supabase
    .from('product_barcodes')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (error) {
    logger.error('Barcode availability check failed', toLogContext(error))
    throw error
  }

  if (data !== null) throw new DuplicateBarcodeError(code)
}

/** Attaches a manufacturer code as an alias (SRD §4 Option B). */
async function linkManufacturerBarcode(productId: string, code: string): Promise<void> {
  // is_primary stays false: the generated ST-code remains the code we print (SRD §9), and
  // uq_product_barcode_primary allows exactly one primary per product. Both codes resolve to
  // this product on a scan, which is the whole point of the alias.
  const { error } = await supabase
    .from('product_barcodes')
    .insert({ product_id: productId, code, symbology: 'CODE128', is_primary: false })

  if (error) {
    logger.error('Could not link manufacturer barcode', { productId, ...toLogContext(error) })
    if (isUniqueViolation(error)) throw new BarcodeNotLinkedError(productId, code)
    throw error
  }
}

export interface SavedProduct {
  id: string
  name: string
  skuBarcode: string
}

/**
 * Creates a product (DSK-205) and, for SRD §4 Option B, links the pasted manufacturer code.
 *
 * @param values - MUST already have passed `validateProductForm`.
 * @returns The new product's id and generated ST-barcode, for the label preview.
 * @throws DuplicateBarcodeError when the manufacturer code is taken.
 * @throws BarcodeNotLinkedError when the product saved but the alias lost a race.
 *
 * `sku_barcode` is never sent: the column defaults to `app.next_product_barcode()`, so the
 * sequence lives in the database and two clients cannot mint ST00000042 twice.
 */
export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: ProductFormValues): Promise<SavedProduct> => {
      const manufacturerCode =
        values.barcodeSource === 'MANUFACTURER' ? values.manufacturerBarcode.trim() : null

      if (manufacturerCode !== null) await assertBarcodeFree(manufacturerCode)

      const { data, error } = await supabase
        .from('products')
        .insert(toProductRow(values))
        .select('id, name, sku_barcode')
        .single()

      if (error) {
        logger.error('Could not create product', toLogContext(error))
        throw error
      }

      if (manufacturerCode !== null) await linkManufacturerBarcode(data.id, manufacturerCode)

      logger.info('Product created', { productId: data.id })
      return { id: data.id, name: data.name, skuBarcode: data.sku_barcode }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    }
  })
}

/** Raised when someone else changed this product since the form was opened. */
export class StaleProductError extends Error {
  constructor() {
    super('STALE_PRODUCT')
    this.name = 'StaleProductError'
  }
}

interface UpdateProductInput {
  id: string
  /** The version read when the form opened. Guards against overwriting a concurrent edit. */
  version: number
  values: ProductFormValues
}

/**
 * Updates a product (DSK-207).
 *
 * @throws StaleProductError when another user saved this product first.
 * @throws DuplicateBarcodeError / BarcodeNotLinkedError as `useCreateProduct`.
 *
 * The `version` match is optimistic locking: `tg_set_audit` bumps the counter on every write,
 * so a mismatch means someone saved between this form opening and submitting. Without it the
 * second save silently discards the first — the classic lost update, invisible until an audit.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, version, values }: UpdateProductInput): Promise<SavedProduct> => {
      const manufacturerCode =
        values.barcodeSource === 'MANUFACTURER' ? values.manufacturerBarcode.trim() : null

      if (manufacturerCode !== null) await assertBarcodeFree(manufacturerCode)

      const { data, error } = await supabase
        .from('products')
        .update(toProductRow(values))
        .eq('id', id)
        .eq('version', version)
        .select('id, name, sku_barcode')
        .maybeSingle()

      if (error) {
        logger.error('Could not update product', { productId: id, ...toLogContext(error) })
        throw error
      }

      // maybeSingle returns null when the WHERE matched nothing — here that means the version
      // moved, because RLS would have failed the read as an error instead.
      if (data === null) {
        logger.warn('Product update rejected as stale', { productId: id, version })
        throw new StaleProductError()
      }

      if (manufacturerCode !== null) await linkManufacturerBarcode(id, manufacturerCode)

      logger.info('Product updated', { productId: id })
      return { id: data.id, name: data.name, skuBarcode: data.sku_barcode }
    },
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product', product.id] })
    }
  })
}

/**
 * Activates or deactivates a product (DSK-218).
 *
 * Deliberately flips `is_active` and never deletes. SRD §16 keeps every movement in the
 * ledger forever; a product row that vanished would orphan its own history and make old
 * inward and outward reports unreadable. "No longer used" is a state, not an absence.
 */
export function useSetProductActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }): Promise<void> => {
      const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id)

      if (error) {
        logger.error('Could not change product status', { productId: id, ...toLogContext(error) })
        throw error
      }

      logger.info('Product status changed', { productId: id, isActive })
    },
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product', id] })
    }
  })
}
