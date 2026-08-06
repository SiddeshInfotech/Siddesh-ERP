import { useQuery } from '@tanstack/react-query'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Dashboard summary cards (SRD §12; DSK-401 → DSK-405).
 *
 * CUMULATIVE, ALL-PRODUCTS (client chat 06/08/2026). Every figure is system-wide, not one
 * office's slice: stock reads `v_product_stock_status` (barcode lifecycle rolled up per
 * product across all offices) and today's movements read `barcode_scans` (each RECEIVE scan
 * is one unit inwarded, each ISSUE one unit outwarded). Both sources are globally readable,
 * so the headline, the breakdown, and the low/out counts all agree.
 *
 * SRD §12 also lists "Pending Orders" — explicitly marked future, and there is no purchase
 * order table yet, so it is left out rather than shown as a zero.
 */

/** The home screen is the first thing opened each morning; stale figures there are noticed. */
const STALE_TIME = 20_000

export interface DashboardSummary {
  /** Units currently in stock across every product (the headline "current stock"). */
  totalOnHand: number
  /** Units received today (DSK-403). */
  todayInward: number
  /** Units given out today (DSK-404). */
  todayOutward: number
  /** Products at or below their minimum level (DSK-405). */
  lowStockCount: number
  /** Products with nothing in stock. */
  outOfStockCount: number
  /** Products that currently have stock. */
  productsTracked: number
  /** Unit lifecycle breakdown under the headline. */
  unitsGenerated: number
  unitsInStock: number
  unitsOutward: number
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
      const todayStart = startOfToday()

      // Per-product stock (all products), plus today's inward/outward as unit-scan counts.
      // head:true asks PostgREST for the count only, not the rows.
      const [stockResult, inwardResult, outwardResult] = await Promise.all([
        supabase
          .from('v_product_stock_status' as any)
          .select('in_stock_units, generated_units, outward_units, min_stock'),
        supabase
          .from('barcode_scans')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'RECEIVE')
          .gte('scanned_at', todayStart),
        supabase
          .from('barcode_scans')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'ISSUE')
          .gte('scanned_at', todayStart)
      ])

      if (stockResult.error) {
        logger.error('Dashboard stock query failed', toLogContext(stockResult.error))
        throw stockResult.error
      }
      if (inwardResult.error) {
        logger.error('Dashboard inward count failed', toLogContext(inwardResult.error))
        throw inwardResult.error
      }
      if (outwardResult.error) {
        logger.error('Dashboard outward count failed', toLogContext(outwardResult.error))
        throw outwardResult.error
      }

      const rows = (stockResult.data ?? []) as Array<{
        in_stock_units?: number
        generated_units?: number
        outward_units?: number
        min_stock?: number
      }>

      const totals = rows.reduce(
        (acc, row) => {
          // ?? not ||: a real 0 must count as 0.
          const inStock = row.in_stock_units ?? 0
          const minStock = row.min_stock ?? 0
          return {
            unitsInStock: acc.unitsInStock + inStock,
            unitsGenerated: acc.unitsGenerated + (row.generated_units ?? 0),
            unitsOutward: acc.unitsOutward + (row.outward_units ?? 0),
            productsTracked: acc.productsTracked + (inStock > 0 ? 1 : 0),
            lowStockCount: acc.lowStockCount + (inStock <= minStock ? 1 : 0),
            outOfStockCount: acc.outOfStockCount + (inStock === 0 ? 1 : 0)
          }
        },
        {
          unitsInStock: 0,
          unitsGenerated: 0,
          unitsOutward: 0,
          productsTracked: 0,
          lowStockCount: 0,
          outOfStockCount: 0
        }
      )

      return {
        totalOnHand: totals.unitsInStock,
        todayInward: inwardResult.count ?? 0,
        todayOutward: outwardResult.count ?? 0,
        lowStockCount: totals.lowStockCount,
        outOfStockCount: totals.outOfStockCount,
        productsTracked: totals.productsTracked,
        unitsGenerated: totals.unitsGenerated,
        unitsInStock: totals.unitsInStock,
        unitsOutward: totals.unitsOutward
      }
    }
  })
}
