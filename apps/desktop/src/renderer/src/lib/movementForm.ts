/**
 * Validation for the Inward and Outward forms (SRD §5, §6).
 *
 * Pure. Every rule mirrors a CHECK constraint or an RPC guard, and that duplication is
 * deliberate: it tells the storekeeper which box is wrong before a round-trip. The server
 * still decides (rule 0.4) — in particular this file never decides whether stock is
 * sufficient. Only `save_outward` can, under a row lock.
 */

/** chk_suppliers_gst / chk_customers_gst — the 15-character GSTIN format. */
const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/

/** chk_suppliers_mobile / chk_customers_mobile — exactly ten digits. */
const MOBILE_PATTERN = /^[0-9]{10}$/

/** stock_ledger.qty_delta is an integer; past this a mistyped 9999999999 overflows. */
const MAX_QTY = 1_000_000

/**
 * Validates an optional GST number.
 *
 * @returns null when absent or well-formed, otherwise the message.
 *
 * This one earns its keep: the CHECK is on the table, so a malformed GST does not fail
 * politely — it aborts the whole `save_inward` transaction and the stock is never received.
 * A typo in an optional field must not cost you a delivery.
 */
export function findGstProblem(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  if (value.length === 0) return null
  if (!GST_PATTERN.test(value)) return 'A GST number is 15 characters, e.g. 27AAAAA0000A1Z5.'
  return null
}

/** Validates an optional 10-digit mobile number. Same reasoning as `findGstProblem`. */
export function findMobileProblem(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return null
  if (!MOBILE_PATTERN.test(value)) return 'A mobile number is exactly 10 digits.'
  return null
}

/**
 * Validates a movement quantity (DSK-304, DSK-313).
 *
 * @returns null when usable, otherwise the message.
 *
 * Deliberately does NOT compare against available stock. The client's idea of "available" is
 * always stale — two clerks can scan the last unit in the same second — so only the server,
 * holding the row lock, may reject for stock. The UI warns; the database decides.
 */
export function findQtyProblem(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return 'Enter a quantity.'

  const qty = Number(value)
  if (!Number.isFinite(qty)) return 'Enter a whole number.'
  if (!Number.isInteger(qty)) return 'Quantity must be a whole number.'
  if (qty <= 0) return 'Quantity must be more than zero.'
  if (qty > MAX_QTY) return `That is too large. Keep it under ${MAX_QTY}.`

  return null
}

/** Blank optional text becomes NULL, never ''. '' fails the CHECK; absence does not. */
export function orNull(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length === 0 ? null : trimmed
}

/** Display fallback for optional text in history tables — an em dash beats a blank cell. */
export function orDash(value: string | null | undefined): string {
  return value !== null && value !== undefined && value.trim().length > 0 ? value : '—'
}

/** GST is stored upper-case; the CHECK only accepts upper-case. */
export function normaliseGst(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  return value.length === 0 ? null : value
}
