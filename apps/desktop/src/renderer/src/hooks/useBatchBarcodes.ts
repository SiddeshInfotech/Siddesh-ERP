import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export type BarcodeStatus = 'GENERATED' | 'IN_STOCK' | 'OUTWARD' | 'VOID'
export type ScanSource = 'USB' | 'BLUETOOTH' | 'CAMERA' | 'MANUAL'

export interface BatchBarcodeRow {
  id: string
  code: string
  symbology: string
  status: BarcodeStatus
  created_at: string
  /** When the physical unit was scanned in. Null while still GENERATED. */
  scanned_at: string | null
  /** Full name of the user who scanned it (→ "Performed By"). */
  scanned_by_name: string | null
  device_source: ScanSource | null
}

/**
 * The item-level barcodes of one batch, each with its live scan lifecycle.
 *
 * Reads `v_batch_barcodes`, which joins each barcode to its latest RECEIVE scan
 * (who / when / device). Resolves the batch_code the UI holds into a batch_id first.
 *
 * @returns The batch's barcodes ordered by code. Unknown batch_code returns `[]`.
 */
export function useBatchBarcodes(productId?: string | null, batchCode?: string | null) {
  return useQuery({
    queryKey: ['batch_barcodes_v5', productId, batchCode],
    enabled: !!productId && !!batchCode,
    queryFn: async () => {
      const { data: batch, error: batchError } = await supabase
        .from('product_batches')
        .select('id')
        .eq('product_id', productId!)
        .eq('code', batchCode!)
        .maybeSingle()

      if (batchError) throw batchError
      if (!batch) return []

      const { data, error } = await supabase
        .from('v_batch_barcodes')
        .select('id, code, symbology, status, created_at, scanned_at, scanned_by_name, device_source')
        .eq('batch_id', batch.id)
        .order('code', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row) => ({
        id: row.id ?? '',
        code: row.code ?? '',
        symbology: row.symbology ?? 'CODE128',
        status: (row.status ?? 'GENERATED') as BarcodeStatus,
        created_at: row.created_at ?? '',
        scanned_at: row.scanned_at,
        scanned_by_name: row.scanned_by_name,
        device_source: row.device_source as ScanSource | null
      })) as BatchBarcodeRow[]
    }
  })
}

export function useDeleteBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.from('product_batches').delete().eq('id', batchId)
      if (error) {
        if (error.code === '23503') {
          throw new Error('Cannot delete this batch because it has already been used in stock inward or outward movements.')
        }
        throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
      void queryClient.invalidateQueries({ queryKey: ['batch_barcodes_v5'] })
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['last_barcode'] })
    }
  })
}

export function useDeleteBarcode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (barcodeId: string) => {
      const { error } = await supabase.from('product_barcodes').delete().eq('id', barcodeId)
      if (error) {
        if (error.code === '23503') {
          throw new Error('Cannot delete this barcode because it is referenced in active scan transactions.')
        }
        throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
      void queryClient.invalidateQueries({ queryKey: ['batch_barcodes_v5'] })
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['last_barcode'] })
    }
  })
}
