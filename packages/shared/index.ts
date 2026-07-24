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

export interface ScannedProduct {
  id: string
  name: string
  category: string | null
  brand: string | null
  model: string | null
  unit: string | null
  sku_barcode: string
  tracking_mode: 'QUANTITY' | 'SERIAL'
  is_kit: boolean
}

/** A specific serial-tracked unit, when the scanned code was a unit barcode (SRD §18B). */
export interface ScannedUnit {
  id: string
  serial_no: string | null
  unit_barcode: string
  status: string
}

export interface ScannedStock {
  /** Null for an ADMIN, who has no office and whose figures are summed across all three. */
  office_id: string | null
  qty_on_hand: number
  /** On hand minus reserved. This is the number the storekeeper may actually give out. */
  qty_available: number
}

/**
 * Verified against `scan_lookup` in 06_rpc.sql on 18/07/2026.
 *
 * `found: false` is a SUCCESSFUL response, not an error — `error` stays null. Branch on
 * `data.found`, never on `error` (SRD §13: "Barcode not found. Create New Product?").
 */
export type ScanLookupResult =
  | {
      found: true
      match_type: 'PRODUCT' | 'UNIT'
      product: ScannedProduct
      unit: ScannedUnit | null
      stock: ScannedStock
      batch_no: string | null
      batch?: { id: string; code: string } | null
    }
  | {
      found: false
      match_type: 'UNKNOWN'
      product: null
      stock: null
      batch_no: null
      batch?: null
    }

export type SaveResult = {
  ok: true
  ledger_id: string
  balance_after: number
  /** True when this client_txn_id had already been posted — the RPC replayed the original. */
  replayed: boolean
}

export type SaveInwardResult = SaveResult & { inward_id: string }
export type SaveOutwardResult = SaveResult & { outward_id: string }

/** `save_outward` raises this as a Postgres exception; it arrives via `error`, not `data`. */
export const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK'
