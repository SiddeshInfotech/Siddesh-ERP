export type { Database } from './database.types'

/**
 * Return shapes for the three RPCs. These mirror Document/Contract.md, which is
 * locked — if the backend changes a shape, Contract.md changes first, then this.
 *
 * Once BE-19 lands, `database.types.ts` will carry the generated Functions types
 * and these hand-written shapes should be re-derived from it rather than kept in
 * parallel.
 */

export type OutwardType =
  | 'SALE'
  | 'DEMO'
  | 'REPLACEMENT'
  | 'INTERNAL_USE'
  | 'SERVICE'
  | 'SAMPLE'

export type ScanLookupResult =
  | {
      found: true
      match_type: 'PRODUCT'
      product: {
        id: string
        name: string
        category: string | null
        brand: string | null
        model: string | null
        unit: string
        sku_barcode: string
      }
      stock: { office_id: string; qty_available: number }
    }
  | {
      found: false
      match_type: 'UNKNOWN'
      product: null
      stock: null
    }

export type SaveResult = {
  ok: true
  ledger_id: string
  balance_after: number
}

/** `save_outward` raises this as a Postgres exception; it arrives via `error`, not `data`. */
export const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK'
