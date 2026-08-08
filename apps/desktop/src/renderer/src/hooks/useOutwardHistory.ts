import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export interface OutwardHistoryRow {
  id: string
  issued_at: string
  outward_no: string
  product_id: string
  product_name: string
  batch_code: string | null
  outward_qty: number
  remaining_qty: number
  total_qty: number
  outward_type: string
  // Party tab
  party_name: string | null
  contact_person: string | null
  party_mobile: string | null
  party_gst: string | null
  party_address: string | null
  invoice_no: string | null
  sales_order_no: string | null
  // Other details tab
  handed_over_by: string | null
  received_by: string | null
  delivery_method: string | null
  notes: string | null
  // Scan audit (who / when / where) — populated when units are scanned in/out
  inwarded_at: string | null
  outwarded_at: string | null
  scanned_by: string | null
  scanned_at_office: string | null
}

/**
 * Outward history for the list + tabbed table, mirroring useInwardHistory.
 *
 * @param productId - when set, filters to that product (the "Selected Product" filter).
 * @returns One row per outward line (Date + Product + Batch), newest first.
 */
export interface BatchOutwardEntry {
  id: string
  outward_no: string
  outward_qty: number
  issued_at: string
  party_name: string | null
}

/**
 * The outward entries (documents) that dispatched from one batch, oldest first.
 *
 * Used by the Batch Records modal to group a batch's dispatched units by the outward
 * entry they belong to. The database does not store a per-unit → entry link, so the modal
 * assigns units to entries FIFO using these quantities; this returns the entries + their
 * authorised quantity in creation order so that assignment is deterministic.
 */
export function useBatchOutwardEntries(productId?: string | null, batchCode?: string | null) {
  return useQuery({
    queryKey: ['batch_outward_entries_v1', productId, batchCode],
    enabled: !!productId && !!batchCode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_outward_history')
        .select('id, outward_no, outward_qty, issued_at, party_name, created_at')
        .eq('product_id', productId!)
        .eq('batch_code', batchCode!)
        .order('created_at', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row: any) => ({
        id: row.id ?? '',
        outward_no: row.outward_no ?? '',
        outward_qty: row.outward_qty ?? 0,
        issued_at: row.issued_at ?? '',
        party_name: row.party_name ?? null
      })) as BatchOutwardEntry[]
    }
  })
}

export function useOutwardHistory(productId?: string | null) {
  return useQuery({
    queryKey: ['outward_history_v1', productId],
    queryFn: async () => {
      let query = supabase
        .from('v_outward_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (productId) {
        query = query.eq('product_id', productId)
      }

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((row: any) => ({
        id: row.id ?? '',
        issued_at: row.issued_at ?? '',
        outward_no: row.outward_no ?? '',
        product_id: row.product_id ?? '',
        product_name: row.product_name ?? '',
        batch_code: row.batch_code ?? null,
        outward_qty: row.outward_qty ?? 0,
        remaining_qty: row.remaining_qty ?? 0,
        total_qty: row.total_qty ?? 0,
        outward_type: row.outward_type ?? '',
        party_name: row.party_name ?? null,
        contact_person: row.contact_person ?? null,
        party_mobile: row.party_mobile ?? null,
        party_gst: row.party_gst ?? null,
        party_address: row.party_address ?? null,
        invoice_no: row.invoice_no ?? null,
        sales_order_no: row.sales_order_no ?? null,
        handed_over_by: row.handed_over_by ?? null,
        received_by: row.received_by ?? null,
        delivery_method: row.delivery_method ?? null,
        notes: row.notes ?? null,
        inwarded_at: row.inwarded_at ?? null,
        outwarded_at: row.outwarded_at ?? null,
        scanned_by: row.scanned_by ?? null,
        scanned_at_office: row.scanned_at_office ?? null
      })) as OutwardHistoryRow[]
    }
  })
}
