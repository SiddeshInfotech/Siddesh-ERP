import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface InwardHistoryRow {
  id: string
  quantity: number
  inward_no: string
  received_at: string
  brought_by: string | null
  product_id: string
  product_name: string
  batch_code: string | null
  batch_id: string | null
  inward_qty: number
  remaining_qty: number
  total_qty: number
  total_barcodes: number
  qty_generated: number
  qty_in_stock: number
  qty_outward: number
  qty_void: number
  // Supplier & Delivery tab
  supplier_name: string | null
  supplier_mobile: string | null
  supplier_gst: string | null
  supplier_address: string | null
  invoice_no: string | null
  invoice_date: string | null
  purchase_order_no: string | null
  notes: string | null
  // Scan audit (who / when / where) — populated when units are scanned in/out
  inwarded_at: string | null
  outwarded_at: string | null
  scanned_by: string | null
  scanned_at_office: string | null
}

export function useInwardHistory(productId?: string | null) {
  return useQuery({
    queryKey: ['inward_history_v2', productId],
    queryFn: async () => {
      let query = supabase
        .from('v_inward_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (productId) {
        query = query.eq('product_id', productId)
      }

      const { data, error } = await query

      if (error) throw error

      return (data || []).map((row: any) => ({
        id: row.id,
        quantity: row.inward_qty,
        inward_qty: row.inward_qty,
        inward_no: row.inward_no ?? '',
        received_at: row.received_at ?? '',
        brought_by: row.brought_by ?? null,
        product_id: row.product_id,
        product_name: row.product_name ?? '',
        batch_code: row.batch_code ?? null,
        batch_id: row.batch_id ?? null,
        remaining_qty: row.remaining_qty ?? 0,
        total_qty: row.total_qty ?? 0,
        total_barcodes: row.total_barcodes ?? 0,
        qty_generated: row.qty_generated ?? 0,
        qty_in_stock: row.qty_in_stock ?? 0,
        qty_outward: row.qty_outward ?? 0,
        qty_void: row.qty_void ?? 0,
        supplier_name: row.supplier_name ?? null,
        supplier_mobile: row.supplier_mobile ?? null,
        supplier_gst: row.supplier_gst ?? null,
        supplier_address: row.supplier_address ?? null,
        invoice_no: row.invoice_no ?? null,
        invoice_date: row.invoice_date ?? null,
        purchase_order_no: row.purchase_order_no ?? null,
        notes: row.notes ?? null,
        inwarded_at: row.inwarded_at ?? null,
        outwarded_at: row.outwarded_at ?? null,
        scanned_by: row.scanned_by ?? null,
        scanned_at_office: row.scanned_at_office ?? null
      })) as InwardHistoryRow[]
    }
  })
}
