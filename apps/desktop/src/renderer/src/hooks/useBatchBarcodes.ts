import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface BatchBarcodeRow {
  id: string
  code: string
  symbology: string
  created_at: string
}

export function useBatchBarcodes(productId?: string | null, batchCode?: string | null) {
  return useQuery({
    queryKey: ['batch_barcodes_v3', productId, batchCode],
    enabled: !!productId && !!batchCode,
    queryFn: async () => {
      // First find the batch_id
      const { data: batch, error: batchError } = await supabase
        .from('product_batches')
        .select('id')
        .eq('product_id', productId!)
        .eq('code', batchCode!)
        .single()

      if (batchError) {
        if (batchError.code === 'PGRST116') return [] // not found
        throw batchError
      }

      const { data, error } = await supabase
        .from('product_barcodes')
        .select('*')
        .eq('product_id', productId!)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []).map((row: any) => ({
        id: row.id,
        code: row.code,
        symbology: row.symbology,
        created_at: row.created_at
      })) as BatchBarcodeRow[]
    }
  })
}
