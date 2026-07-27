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

export interface SavedProduct {
  id: string
  name: string
  skuBarcode: string
}

function generateUomCode(name: string): string {
  const numMap: Record<string, string> = {
    '0': 'ZERO',
    '1': 'ONE',
    '2': 'TWO',
    '3': 'THREE',
    '4': 'FOUR',
    '5': 'FIVE',
    '6': 'SIX',
    '7': 'SEVEN',
    '8': 'EIGHT',
    '9': 'NINE'
  }
  const replaced = name.trim().toUpperCase().replace(/[0-9]/g, (m) => numMap[m] ?? '')
  let cleaned = replaced.replace(/[^A-Z]/g, '').slice(0, 10)
  if (cleaned.length < 2) cleaned = (cleaned + 'PCS').slice(0, 2)
  return cleaned.slice(0, 10)
}

/**
 * Resolves custom 'OTHER' category, brand, uom, or gst values into database IDs or numbers.
 * Inserts new rows into categories, brands, or uoms tables if they don't already exist.
 */
async function resolveLookupIds(values: ProductFormValues): Promise<ProductFormValues> {
  const resolved = { ...values }

  if (values.categoryId === 'OTHER' && values.customCategory.trim().length > 0) {
    const catName = values.customCategory.trim()
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', catName)
      .maybeSingle()

    if (existing) {
      resolved.categoryId = existing.id
    } else {
      const { data: inserted, error } = await supabase
        .from('categories')
        .insert({ name: catName })
        .select('id')
        .single()

      if (error) {
        logger.error('Could not create custom category', toLogContext(error))
        throw error
      }
      resolved.categoryId = inserted.id
    }
  }

  if (values.brandId === 'OTHER' && values.customBrand.trim().length > 0) {
    const brandName = values.customBrand.trim()
    const { data: existing } = await supabase
      .from('brands')
      .select('id')
      .ilike('name', brandName)
      .maybeSingle()

    if (existing) {
      resolved.brandId = existing.id
    } else {
      const { data: inserted, error } = await supabase
        .from('brands')
        .insert({ name: brandName })
        .select('id')
        .single()

      if (error) {
        logger.error('Could not create custom brand', toLogContext(error))
        throw error
      }
      resolved.brandId = inserted.id
    }
  }

  if (values.uomId === 'OTHER' && values.customUom.trim().length > 0) {
    const uomName = values.customUom.trim()
    const code = generateUomCode(uomName)

    const { data: existing } = await supabase
      .from('uoms')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (existing) {
      resolved.uomId = existing.id
    } else {
      const { data: inserted, error } = await supabase
        .from('uoms')
        .insert({ code, name: uomName })
        .select('id')
        .single()

      if (error) {
        logger.error('Could not create custom uom', toLogContext(error))
        throw error
      }
      resolved.uomId = inserted.id
    }
  }

  if (values.gstPercent === 'OTHER') {
    resolved.gstPercent = values.customGst.trim()
  }

  // Safety fallback: if any ID remains 'OTHER', reset to empty string so toProductRow turns it into null
  if (resolved.categoryId === 'OTHER') resolved.categoryId = ''
  if (resolved.brandId === 'OTHER') resolved.brandId = ''
  if (resolved.uomId === 'OTHER') resolved.uomId = ''
  if (resolved.gstPercent === 'OTHER') resolved.gstPercent = ''

  return resolved
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
      const resolvedValues = await resolveLookupIds(values)

      const { data, error } = await supabase
        .from('products')
        .insert(toProductRow(resolvedValues))
        .select('id, name, product_code')
        .single()

      if (error) {
        logger.error('Could not create product', toLogContext(error))
        throw error
      }

      logger.info('Product created', { productId: data.id })
      return { id: data.id, name: data.name, skuBarcode: (data as any).product_code ?? '' }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      void queryClient.invalidateQueries({ queryKey: ['brands'] })
      void queryClient.invalidateQueries({ queryKey: ['uoms'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
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
      const resolvedValues = await resolveLookupIds(values)

      const { data, error } = await supabase
        .from('products')
        .update(toProductRow(resolvedValues))
        .eq('id', id)
        .eq('version', version)
        .select('id, name, product_code')
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

      logger.info('Product updated', { productId: id })
      return { id: data.id, name: data.name, skuBarcode: (data as any).product_code ?? '' }
    },
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      void queryClient.invalidateQueries({ queryKey: ['brands'] })
      void queryClient.invalidateQueries({ queryKey: ['uoms'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product', product.id] })
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
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
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
    }
  })
}

/**
 * Deletes a product from the system. If the product has stock movements or batches,
 * Postgres foreign key constraints will prevent deletion and raise error 23503.
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (productId: string): Promise<void> => {
      const { error } = await supabase.from('products').delete().eq('id', productId)
      if (error) {
        if (error.code === '23503') {
          throw new Error('Cannot delete this product because it has associated batches or stock movements. You can deactivate it instead.')
        }
        logger.error('Failed to delete product', { productId, ...toLogContext(error) })
        throw error
      }
      logger.info('Product deleted', { productId })
    },
    onSuccess: (_result, productId) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product', productId] })
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
      void queryClient.invalidateQueries({ queryKey: ['product-stock'] })
      void queryClient.invalidateQueries({ queryKey: ['scan-lookup'] })
    }
  })
}

