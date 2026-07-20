import { useQuery } from '@tanstack/react-query'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Dashboard summary cards (SRD §12; DSK-401 → DSK-405).
 *
 * SRD §12 also lists "Pending Orders" — explicitly marked future, and there is no purchase
 * order table yet. It is left out rather than shown as a zero, because a card reading 0
 * asserts "none pending", which we cannot know.
 */

/** The home screen is the first thing opened each morning; stale figures there are noticed. */
const STALE_TIME = 20_000

export interface DashboardSummary {
  /** Every unit on hand across the offices this user can see. */
  totalOnHand: number
  /** Units received today (DSK-403). */
  todayInward: number
  /** Units given out today, as a positive number (DSK-404). */
  todayOutward: number
  /** Products at or below their minimum level (DSK-405). */
  lowStockCount: number
  /** Products with nothing left at all. */
  outOfStockCount: number
  productsTracked: number
}

/** Local midnight, as an ISO instant. The storekeeper's "today" is their day, not UTC's. */
function startOfToday(): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    staleTime: STALE_TIME,
    queryFn: async (): Promise<DashboardSummary> => {
      // Two queries in parallel, not one per card. Both go through security_invoker views, so
      // an office sees only its own numbers.
      const [stockResult, todayResult] = await Promise.all([
        supabase.from('v_current_stock').select('qty_on_hand, qty_available, is_low_stock'),
        supabase
          .from('v_product_ledger')
          .select('txn_type, qty_delta')
          .gte('occurred_at', startOfToday())
      ])

      if (stockResult.error) {
        logger.error('Dashboard stock query failed', toLogContext(stockResult.error))
        throw stockResult.error
      }
      if (todayResult.error) {
        logger.error("Dashboard today's movement query failed", toLogContext(todayResult.error))
        throw todayResult.error
      }

      const summary = stockResult.data.reduce(
        (totals, row) => ({
          // ?? not ||: a real 0 must count as 0, not be skipped.
          totalOnHand: totals.totalOnHand + (row.qty_on_hand ?? 0),
          lowStockCount: totals.lowStockCount + (row.is_low_stock === true ? 1 : 0),
          outOfStockCount: totals.outOfStockCount + ((row.qty_available ?? 0) <= 0 ? 1 : 0)
        }),
        { totalOnHand: 0, lowStockCount: 0, outOfStockCount: 0 }
      )

      // qty_delta is signed in the ledger: inward is positive, outward negative. Outward is
      // shown as a magnitude — "12 went out" reads better than "-12".
      const today = todayResult.data.reduce(
        (totals, row) => {
          const delta = row.qty_delta ?? 0
          if (row.txn_type === 'INWARD') return { ...totals, inward: totals.inward + delta }
          if (row.txn_type === 'OUTWARD') return { ...totals, outward: totals.outward - delta }
          // TRANSFER_IN/OUT and ADJUSTMENT are movements too, but neither is a receipt or a
          // dispatch — folding them into these cards would misreport both.
          return totals
        },
        { inward: 0, outward: 0 }
      )

      return {
        totalOnHand: summary.totalOnHand,
        todayInward: today.inward,
        todayOutward: today.outward,
        lowStockCount: summary.lowStockCount,
        outOfStockCount: summary.outOfStockCount,
        productsTracked: stockResult.data.length
      }
    }
  })
}
