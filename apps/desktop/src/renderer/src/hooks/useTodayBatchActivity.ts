import { useQuery } from '@tanstack/react-query'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Today's batch activity, split into inward and outward (client chat 06/08/2026).
 *
 * Reads `barcode_scans` — globally readable, so this is cumulative across every office — for
 * today's RECEIVE (inward) and ISSUE (outward) scans, then rolls them up per batch. Each row
 * is one batch with how many of its units moved today; expanding it shows the unit list.
 */

export interface TodayBatchRow {
  batchId: string
  batchCode: string
  productId: string
  productName: string
  /** Units of this batch that moved (in or out) today. */
  unitsToday: number
  /** Most recent scan time today for this batch — newest batches sort first. */
  lastActivityAt: string
}

export interface TodayBatchActivity {
  inward: TodayBatchRow[]
  outward: TodayBatchRow[]
}

const STALE_TIME = 20_000

/** Local midnight as an ISO instant — the storekeeper's "today", matching the cards. */
function startOfToday(): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

/** Rolls today's scans of one direction up per batch, newest activity first. */
function groupByBatch(rows: any[]): TodayBatchRow[] {
  const byBatch = new Map<string, TodayBatchRow>()

  for (const row of rows) {
    const batchId = row.batch_id
    if (!batchId) continue

    const batch = Array.isArray(row.product_batches) ? row.product_batches[0] : row.product_batches
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const scannedAt = row.scanned_at ?? ''

    const existing = byBatch.get(batchId)
    if (existing) {
      existing.unitsToday += 1
      if (scannedAt > existing.lastActivityAt) existing.lastActivityAt = scannedAt
    } else {
      byBatch.set(batchId, {
        batchId,
        batchCode: batch?.code ?? '—',
        productId: row.product_id ?? '',
        productName: product?.name ?? '—',
        unitsToday: 1,
        lastActivityAt: scannedAt
      })
    }
  }

  return Array.from(byBatch.values()).sort((a, b) =>
    b.lastActivityAt.localeCompare(a.lastActivityAt)
  )
}

export function useTodayBatchActivity() {
  return useQuery({
    queryKey: ['today_batch_activity'],
    staleTime: STALE_TIME,
    queryFn: async (): Promise<TodayBatchActivity> => {
      const { data, error } = await supabase
        .from('barcode_scans')
        .select('batch_id, product_id, action, scanned_at, product_batches(code), products(name)')
        .in('action', ['RECEIVE', 'ISSUE'])
        .gte('scanned_at', startOfToday())
        .order('scanned_at', { ascending: false })

      if (error) {
        logger.error('Today batch activity query failed', toLogContext(error))
        throw error
      }

      const rows = (data ?? []) as any[]
      return {
        inward: groupByBatch(rows.filter((r) => r.action === 'RECEIVE')),
        outward: groupByBatch(rows.filter((r) => r.action === 'ISSUE'))
      }
    }
  })
}
