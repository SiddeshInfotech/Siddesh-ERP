import { useQuery } from '@tanstack/react-query'
import type { TrackingMode } from '@/lib/productForm'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * The product master list (DSK-201, DSK-202, DSK-216, DSK-220).
 *
 * WHY THIS FETCHES THE WHOLE LIST AND NOT A SERVER PAGE
 * Rule §3 says paginate anything that can grow, and names the ledger and reports — lists that
 * grow with every transaction, forever. The product master is not one of those: it grows when
 * someone sells a new kind of thing, so it is a few hundred rows and bounded in practice.
 *
 * Fetching it once buys two things a server page cannot:
 *   1. Sorting by CURRENT STOCK (DSK-220). Stock lives in stock_balances, so PostgREST cannot
 *      order products by it. Server-paging would force us to sort each page in isolation,
 *      which reorders rows *within* a page and is simply wrong.
 *   2. Instant search with no debounce and no spinner per keystroke.
 *
 * The table still renders one page at a time, so the DOM stays small. The fetch is capped —
 * see PRODUCT_LIMIT — so this can never become an unbounded select.
 */

/** Hard ceiling. Past this the assumption above is broken and the UI says so rather than lying. */
export const PRODUCT_LIMIT = 2000

/** Stock moves all day; the master list does not. Short enough to notice an inward. */
const STALE_TIME = 30_000

export interface ProductListItem {
  id: string
  name: string
  skuBarcode: string
  categoryId: string | null
  categoryName: string | null
  brandName: string | null
  uomCode: string | null
  modelNumber: string | null
  minStock: number
  isActive: boolean
  trackingMode: TrackingMode
  /** Physical units in the office(s) this user can see. */
  qtyOnHand: number
  /** On hand minus reserved. This is what may actually be given out. */
  qtyAvailable: number
  isLowStock: boolean
}

export interface ProductListResult {
  items: ProductListItem[]
  /** True when there are more products than PRODUCT_LIMIT, so `items` is incomplete. */
  isTruncated: boolean
  totalCount: number
}

/** One row per product per office; an ADMIN sees every office, so quantities must be summed. */
interface StockTotals {
  qtyOnHand: number
  qtyAvailable: number
}

/**
 * Sums stock per product across every office the caller may see.
 *
 * An ADMIN has no office_id and legitimately sees all three (RLS `can_access_office`), so a
 * product with 5 in Pune and 3 in Nashik must read 8 — not whichever row arrived first.
 */
async function fetchStockByProduct(): Promise<Map<string, StockTotals>> {
  const { data, error } = await supabase
    .from('v_current_stock')
    .select('product_id, qty_on_hand, qty_available')

  if (error) {
    logger.error('Could not load stock balances', toLogContext(error))
    throw error
  }

  const totals = new Map<string, StockTotals>()

  for (const row of data) {
    // The view's columns are nullable in the generated types because it is a view; a row with
    // no product_id cannot be attributed to anything, so skip rather than guess.
    if (row.product_id === null) continue

    const current = totals.get(row.product_id) ?? { qtyOnHand: 0, qtyAvailable: 0 }
    totals.set(row.product_id, {
      // ?? not ||: a real 0 must stay 0.
      qtyOnHand: current.qtyOnHand + (row.qty_on_hand ?? 0),
      qtyAvailable: current.qtyAvailable + (row.qty_available ?? 0)
    })
  }

  return totals
}

/**
 * Current stock for one product (DSK-219).
 *
 * Its own query rather than reusing the list: a deep link to a product should not pull two
 * thousand rows to read one number.
 */
export function useProductStock(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-stock', productId],
    enabled: productId !== undefined,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<StockTotals> => {
      const { data, error } = await supabase
        .from('v_current_stock')
        .select('qty_on_hand, qty_available')
        .eq('product_id', productId ?? '')

      if (error) {
        logger.error('Could not load product stock', { productId, ...toLogContext(error) })
        throw error
      }

      // Zero rows is not an error: a product that has never been received has no balance row.
      // It has 0 in stock, and saying so is the correct answer.
      return data.reduce<StockTotals>(
        (total, row) => ({
          qtyOnHand: total.qtyOnHand + (row.qty_on_hand ?? 0),
          qtyAvailable: total.qtyAvailable + (row.qty_available ?? 0)
        }),
        { qtyOnHand: 0, qtyAvailable: 0 }
      )
    }
  })
}

const LIST_SELECT =
  'id, name, product_code, model_number, min_stock, is_active, tracking_mode, category_id, categories(name), brands(name), uoms(code), product_barcodes(code, is_primary)'

/**
 * Loads every product the user may see, with current stock merged in.
 *
 * Products and stock are two queries, run in parallel — not a fetch per row. A product with no
 * stock row yet (just created, never received) is absent from v_current_stock, which inner
 * joins stock_balances; it must still appear in the list, reading 0. That is why the list is
 * driven by `products` and stock is merged onto it, rather than the other way round.
 */
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    staleTime: STALE_TIME,
    queryFn: async (): Promise<ProductListResult> => {
      const [productsResult, stockByProduct] = await Promise.all([
        supabase
          .from('products')
          .select(LIST_SELECT, { count: 'exact' })
          .order('name')
          .range(0, PRODUCT_LIMIT - 1),
        fetchStockByProduct()
      ])

      const { data, error, count } = productsResult
      if (error) {
        logger.error('Could not load products', toLogContext(error))
        throw error
      }

      const items = data.map((row): ProductListItem => {
        const stock = stockByProduct.get(row.id) ?? { qtyOnHand: 0, qtyAvailable: 0 }
        const primaryCode = (row.product_barcodes as any[])?.find((b) => b.is_primary)?.code
        const anyCode = (row.product_barcodes as any[])?.[0]?.code

        return {
          id: row.id,
          name: row.name,
          skuBarcode: primaryCode ?? anyCode ?? (row as any).product_code ?? '',
          categoryId: row.category_id,
          categoryName: row.categories?.name ?? null,
          brandName: row.brands?.name ?? null,
          uomCode: row.uoms?.code ?? null,
          modelNumber: row.model_number,
          minStock: row.min_stock,
          isActive: row.is_active,
          trackingMode: row.tracking_mode,
          qtyOnHand: stock.qtyOnHand,
          qtyAvailable: stock.qtyAvailable,
          // Matches v_current_stock's own rule, so the list and the Stock report agree.
          isLowStock: stock.qtyAvailable <= row.min_stock
        }
      })

      const totalCount = count ?? items.length

      return { items, isTruncated: totalCount > PRODUCT_LIMIT, totalCount }
    }
  })
}
