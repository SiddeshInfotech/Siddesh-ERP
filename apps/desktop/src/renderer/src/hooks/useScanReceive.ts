import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import type { ScanSource } from './useBatchBarcodes'

export interface ScanReceiveResult {
  ok?: boolean
  found?: boolean
  already?: boolean
  replayed?: boolean
  barcode_id?: string
  code?: string
  status?: string
  error?: string
}

interface ScanReceiveInput {
  code: string
  deviceSource: ScanSource
  scanContext: 'INWARD' | 'OUTWARD'
  documentId: string
}

/**
 * Marks one physical unit received by scanning its barcode.
 *
 * Calls `scan_receive`, which flips the barcode GENERATED → IN_STOCK and appends an
 * append-only scan event (who / when / device). A fresh `client_txn_id` is minted per
 * scan — each physical scan is its own transaction; the server dedupes a double-fire
 * of the same scan by that id, and a re-scan of an already-received unit returns
 * `already: true` rather than erroring.
 *
 * @returns The RPC result. `found: false` means the code is not a known barcode —
 *          that is a not-found outcome, not a thrown error (branch on it, per §2).
 */
export function useScanReceive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ code, deviceSource, scanContext, documentId }: ScanReceiveInput): Promise<ScanReceiveResult> => {
      const { data, error } = await supabase.rpc('scan_receive', {
        p_code: code,
        p_client_txn_id: crypto.randomUUID(),
        p_device_source: deviceSource,
        p_scan_context: scanContext,
        p_document_id: documentId
      })
      if (error) throw error
      return (data ?? {}) as ScanReceiveResult
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['batch_barcodes_v5'] })
      void queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
    }
  })
}
