import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@siddesh/shared'

export type ProductBatch = Database['public']['Tables']['product_batches']['Row']
export type BatchStock = Database['public']['Views']['v_stock_balances_by_batch']['Row']
export type ProductBarcode = Database['public']['Tables']['product_barcodes']['Row']

export function useBatches(productId: string | null) {
  return useQuery({
    queryKey: ['batches', productId],
    queryFn: async () => {
      if (!productId) return []
      const { data, error } = await supabase
        .from('product_batches')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!productId
  })
}

export function useBatchStock(productId: string | null, officeId: string | null) {
  return useQuery({
    queryKey: ['batch_stock', productId, officeId],
    queryFn: async () => {
      if (!productId || !officeId) return []
      const { data, error } = await supabase
        .from('v_stock_balances_by_batch')
        .select('*')
        .eq('product_id', productId)
        .eq('office_id', officeId)

      if (error) throw error
      return data
    },
    enabled: !!productId && !!officeId
  })
}

// Fetch the last barcode sequence used for a specific batch or product
export function useLastBarcode(productId: string | null, batchId: string | null) {
  return useQuery({
    queryKey: ['last_barcode', productId, batchId],
    queryFn: async () => {
      if (!productId) return null
      
      let query = supabase
        .from('product_barcodes')
        .select('code, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .order('code', { ascending: false })
        .limit(1)

      if (batchId) {
        query = query.eq('batch_id', batchId)
      }

      const { data, error } = await query
      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    },
    enabled: !!productId
  })
}

export function useCreateBatch() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (input: { productId: string, batchCode: string }) => {
      const { data, error } = await supabase
        .from('product_batches')
        .insert({
          product_id: input.productId,
          code: input.batchCode
        })
        .select()
        .single()
        
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['batches', variables.productId] })
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
      void queryClient.invalidateQueries({ queryKey: ['batch_barcodes_v5'] })
    }
  })
}
