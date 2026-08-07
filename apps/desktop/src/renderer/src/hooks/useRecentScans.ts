import { useQuery } from '@tanstack/react-query'

import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Recent barcode scans for the dashboard activity feed (SRD §18E — who / when / where).
 *
 * Reads `v_recent_scans`, one row per scan event, newest first. This is what surfaces the
 * phone's standalone Inward/Outward scans on the desktop: each row carries the direction,
 * the person who scanned, and the office they scanned at.
 *
 * @param limit - how many recent scans to show (default 15).
 */

export interface RecentScanRow {
  id: string
  scannedAt: string
  direction: 'INWARD' | 'OUTWARD' | string
  productName: string
  code: string | null
  batchCode: string | null
  scannedByName: string | null
  scannedAtOffice: string | null
}

const STALE_TIME = 20_000

export function useRecentScans(limit = 15) {
  return useQuery({
    queryKey: ['recent_scans', limit],
    staleTime: STALE_TIME,
    queryFn: async (): Promise<RecentScanRow[]> => {
      const { data, error } = await supabase
        .from('v_recent_scans')
        .select('id, scanned_at, direction, product_name, code, batch_code, scanned_by_name, scanned_at_office')
        .order('scanned_at', { ascending: false })
        .limit(limit)

      if (error) {
        logger.error('Recent scans query failed', toLogContext(error))
        throw error
      }

      return (data ?? []).map((row: any) => ({
        id: row.id,
        scannedAt: row.scanned_at ?? '',
        direction: row.direction ?? '',
        productName: row.product_name ?? '—',
        code: row.code ?? null,
        batchCode: row.batch_code ?? null,
        scannedByName: row.scanned_by_name ?? null,
        scannedAtOffice: row.scanned_at_office ?? null
      })) as RecentScanRow[]
    }
  })
}
