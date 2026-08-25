import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export type BarcodeStatus = 'GENERATED' | 'IN_STOCK' | 'OUTWARD' | 'VOID' | 'AVAILABLE' | 'ALLOCATED' | 'INWARDED' | 'OUTWARDED' | 'DAMAGED' | 'CANCELLED'
export type ScanSource = 'USB' | 'BLUETOOTH' | 'CAMERA' | 'MANUAL'

export interface BatchBarcodeRow {
  id: string
  code: string
  symbology: string
  status: BarcodeStatus
  created_at: string
  /** When the label was generated. */
  generated_at: string | null
  /** Full name of the user who generated the label. */
  generated_by_name: string | null
  /** When the unit was most recently received (inwarded). Null until received. */
  inwarded_at: string | null
  /** When the unit was most recently issued (outwarded). Null until issued. */
  outwarded_at: string | null
  /** Most recent scan of any action — the current status change (→ "Scanned by/at"). */
  scanned_at: string | null
  /** Full name of the user who last changed the status (→ "Scanned by"). */
  scanned_by_name: string | null
  /** Office of the login that last changed the status (→ "Scanned at"). */
  scanned_office_name: string | null
  device_source: ScanSource | null
  manufacturer_barcode?: string | null
}

/**
 * The item-level barcodes of one batch, each with its full scan lifecycle.
 *
 * Reads `v_batch_barcodes`, which stamps each barcode with when it was generated,
 * inwarded, and outwarded, plus who last changed its status and at which office.
 * Resolves the batch_code the UI holds into a batch_id first.
 *
 * @returns The batch's barcodes ordered by code. Unknown batch_code returns `[]`.
 */
export function useBatchBarcodes(productId?: string | null, batchCode?: string | null) {
  return useQuery({
    queryKey: ['batch_barcodes_v6', productId, batchCode],
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

      // Cast: migration 47 adds generated_at/inwarded_at/outwarded_at/scanned_office_name;
      // db:types picks them up on regeneration (repo pattern for not-yet-typed columns).
      const { data, error } = await supabase
        .from('v_batch_barcodes' as any)
        .select(
          'id, code, symbology, status, created_at, generated_at, generated_by_name, inwarded_at, outwarded_at, scanned_at, scanned_by_name, scanned_office_name, device_source, manufacturer_barcode'
        )
        .eq('batch_id', batch.id)
        .order('code', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row: any) => ({
        id: row.id ?? '',
        code: row.code ?? '',
        symbology: row.symbology ?? 'CODE128',
        status: (row.status ?? 'GENERATED') as BarcodeStatus,
        created_at: row.created_at ?? '',
        generated_at: row.generated_at ?? row.created_at ?? null,
        generated_by_name: row.generated_by_name ?? null,
        inwarded_at: row.inwarded_at ?? null,
        outwarded_at: row.outwarded_at ?? null,
        scanned_at: row.scanned_at ?? null,
        scanned_by_name: row.scanned_by_name ?? null,
        scanned_office_name: row.scanned_office_name ?? null,
        device_source: (row.device_source ?? null) as ScanSource | null,
        manufacturer_barcode: row.manufacturer_barcode ?? null
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
