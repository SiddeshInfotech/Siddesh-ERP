import { useQuery } from '@tanstack/react-query'
import type { ProductFormValues } from '@/lib/productForm'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * One product, with every field the form and the detail view need (DSK-207, DSK-219).
 */

export interface ProductDetail {
  id: string
  name: string
  skuBarcode: string
  categoryId: string | null
  categoryName: string | null
  brandId: string | null
  brandName: string | null
  uomId: string | null
  uomCode: string | null
  modelNumber: string | null
  description: string | null
  minStock: number
  hsnCode: string | null
  gstPercent: number | null
  trackingMode: 'QUANTITY' | 'SERIAL'
  isKit: boolean
  isActive: boolean
  createdAt: string
  /** Optimistic-concurrency counter. Carried so an edit can detect a concurrent write. */
  version: number
  /** Every code that resolves to this product: our ST-code plus any manufacturer codes. */
  barcodes: { id: string; code: string; isPrimary: boolean; status: string }[]
}

const DETAIL_SELECT =
  'id, name, product_code, category_id, brand_id, uom_id, model_number, description, min_stock, hsn_code, gst_percent, tracking_mode, is_kit, is_active, created_at, version, categories(name), brands(name), uoms(code), product_barcodes(id, code, is_primary, status)'

/**
 * Loads a single product by id.
 *
 * @param id - Product id, or undefined when the form is creating rather than editing.
 *
 * Returns null for "no such product" rather than throwing: an id that does not resolve is an
 * ordinary outcome (a stale link, a deleted product), and the screen shows a not-found state
 * for it. Only a real failure throws.
 */
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    // Never fires for the "new product" case, so the form does not fetch nothing.
    enabled: id !== undefined,
    queryFn: async (): Promise<ProductDetail | null> => {
      const { data, error } = await supabase
        .from('products')
        .select(DETAIL_SELECT)
        .eq('id', id ?? '')
        .maybeSingle()

      if (error) {
        logger.error('Could not load product', { productId: id, ...toLogContext(error) })
        throw error
      }

      if (data === null) return null

      const primaryCode = (data.product_barcodes as any[])?.find((b) => b.is_primary)?.code
      const anyCode = (data.product_barcodes as any[])?.[0]?.code

      return {
        id: data.id,
        name: data.name,
        skuBarcode: primaryCode ?? anyCode ?? (data as any).product_code ?? '',
        categoryId: data.category_id,
        categoryName: data.categories?.name ?? null,
        brandId: data.brand_id,
        brandName: data.brands?.name ?? null,
        uomId: data.uom_id,
        uomCode: data.uoms?.code ?? null,
        modelNumber: data.model_number,
        description: data.description,
        minStock: data.min_stock,
        hsnCode: data.hsn_code,
        gstPercent: data.gst_percent,
        trackingMode: data.tracking_mode,
        isKit: data.is_kit,
        isActive: data.is_active,
        createdAt: data.created_at,
        version: data.version,
        barcodes: data.product_barcodes.map((barcode) => ({
          id: barcode.id,
          code: barcode.code,
          isPrimary: barcode.is_primary,
          status: barcode.status
        }))
      }
    }
  })
}

/**
 * Fills the form from a saved product (DSK-207 — "open its form pre-filled").
 *
 * Nulls become empty strings because inputs cannot hold null; `toProductRow` maps them back.
 * The barcode section is always GENERATE on edit: the ST-code already exists and is printed on
 * boxes, so the form offers *adding* a manufacturer code, never regenerating the SKU.
 */
export function toFormValues(product: ProductDetail): ProductFormValues {
  const standardGst = ['0', '5', '12', '18', '28']
  const rawGst = product.gstPercent === null ? '' : String(product.gstPercent)
  const isCustomGst = rawGst !== '' && !standardGst.includes(rawGst)

  return {
    name: product.name,
    categoryId: product.categoryId ?? '',
    customCategory: '',
    brandId: product.brandId ?? '',
    customBrand: '',
    uomId: product.uomId ?? '',
    customUom: '',
    modelNumber: product.modelNumber ?? '',
    description: product.description ?? '',
    minStock: String(product.minStock),
    hsnCode: product.hsnCode ?? '',
    gstPercent: isCustomGst ? 'OTHER' : rawGst,
    customGst: isCustomGst ? rawGst : '',
    trackingMode: product.trackingMode
  }
}
