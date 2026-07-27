import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * One row from v_batch_registry — one entry per product_batch.
 *
 * Fields are typed from the view definition (20_batch_registry_view.sql).
 * quantity fields are returned as strings by PostgREST when they come from
 * aggregate functions, so we coerce them to number in the mapper below.
 */
export interface BatchRegistryRow {
  /** UUID of product_batches.id */
  batchId: string
  /** e.g. "BATCH-260727-001" */
  batchCode: string
  batchCreatedAt: string
  /** UUID linking to products */
  productId: string
  productName: string
  skuBarcode: string | null
  /** UUID linking to categories — used for filter comparison */
  categoryId: string | null
  categoryName: string | null
  brandName: string | null

  // ── Barcode counts ────────────────────────────────────────────────────────
  /** Total product_barcodes rows in this batch */
  totalBarcodes: number
  /** Barcodes not yet physically scanned in */
  qtyGenerated: number
  /** Barcodes received (scanned RECEIVE) */
  qtyInStock: number
  /** Barcodes that left as outward */
  qtyOutward: number
  /** Barcodes voided */
  qtyVoid: number

  // ── Display helpers ────────────────────────────────────────────────────────
  /** Smallest barcode.code in the batch — shown as "Barcode Initial" */
  firstBarcodeCode: string | null
  /** Sum of stock_balances.qty_on_hand for this product across ALL offices */
  totalQtyOnHand: number
}

/**
 * Fetches every batch in the system (all products) for the Batch Barcode Registry.
 *
 * One query against v_batch_registry — no N+1 fetches, all aggregations
 * done by the DB. Results are newest-first; the UI applies client-side
 * sort/filter since the dataset is bounded (one row per batch).
 */
export function useAllBatches() {
  return useQuery({
    queryKey: ['batch_registry'],
    queryFn: async (): Promise<BatchRegistryRow[]> => {
      const { data, error } = await supabase
        .from('v_batch_registry' as any)
        .select('*')
        .order('batch_created_at', { ascending: false })

      if (error) throw error

      // PostgREST returns COUNT aggregates as strings — coerce to number.
      return ((data as any[]) ?? []).map((row): BatchRegistryRow => ({
        batchId:          row.batch_id          ?? '',
        batchCode:        row.batch_code         ?? '',
        batchCreatedAt:   row.batch_created_at   ?? '',
        productId:        row.product_id         ?? '',
        productName:      row.product_name       ?? '',
        skuBarcode:       row.sku_barcode        ?? null,
        categoryId:       row.category_id        ?? null,
        categoryName:     row.category_name      ?? null,
        brandName:        row.brand_name         ?? null,
        totalBarcodes:    Number(row.total_barcodes  ?? 0),
        qtyGenerated:     Number(row.qty_generated   ?? 0),
        qtyInStock:       Number(row.qty_in_stock    ?? 0),
        qtyOutward:       Number(row.qty_outward     ?? 0),
        qtyVoid:          Number(row.qty_void        ?? 0),
        firstBarcodeCode: row.first_barcode_code ?? null,
        totalQtyOnHand:   Number(row.total_qty_on_hand ?? 0),
      }))
    }
  })
}
