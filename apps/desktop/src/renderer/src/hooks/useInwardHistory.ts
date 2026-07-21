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
  inward_qty: number
  remaining_qty: number
  total_qty: number
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
        remaining_qty: row.remaining_qty ?? 0,
        total_qty: row.total_qty ?? 0
      })) as InwardHistoryRow[]
    }
  })
}
