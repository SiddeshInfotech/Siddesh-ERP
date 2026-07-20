import { INSUFFICIENT_STOCK } from '@siddesh/shared'

/**
 * Error normalisation.
 *
 * Two jobs, and keeping them apart is the whole point of this file:
 *   1. `toLogContext` — everything a support engineer needs, for the log only.
 *   2. `toUserMessage` — one calm sentence, safe to show a storekeeper.
 *
 * A raw Postgres error must never reach the screen: it is unreadable to the user and it
 * leaks table and column names to anyone standing at the counter.
 */

/** Anything Supabase or the network can hand back. Never `any`. */
export type UnknownError = unknown

interface ErrorShape {
  message?: string
  code?: string
  details?: string
  name?: string
}

/** Narrows an unknown throwable without asserting. */
function asErrorShape(error: UnknownError): ErrorShape {
  if (typeof error === 'object' && error !== null) return error as ErrorShape
  if (typeof error === 'string') return { message: error }
  return {}
}

/**
 * True when the server rejected an outward for lack of stock.
 *
 * The server raises `INSUFFICIENT_STOCK: available 1, requested 2`. This is an *expected*
 * business outcome, not a bug — it is the concurrency guard doing its job when two offices
 * race for the last unit.
 */
export function isInsufficientStock(error: UnknownError): boolean {
  return asErrorShape(error).message?.startsWith(INSUFFICIENT_STOCK) ?? false
}

/**
 * Extracts the true available quantity from an INSUFFICIENT_STOCK error.
 *
 * @returns The available count, or null if the message is not in the expected shape.
 *
 * Returns null rather than guessing 0: showing "Only 0 left" when we failed to parse would
 * be a confident lie to the user.
 */
export function parseAvailableQty(error: UnknownError): number | null {
  const match = asErrorShape(error).message?.match(/available (\d+)/)
  if (!match?.[1]) return null

  const qty = Number.parseInt(match[1], 10)
  return Number.isNaN(qty) ? null : qty
}

/**
 * True when Postgres rejected a write for breaking a UNIQUE index.
 *
 * The one that matters here is `uq_product_barcode_code` (SRD §4, DSK-210): a barcode that
 * resolves to two products makes every future scan ambiguous, so the index — not the UI — is
 * what actually prevents it. This turns that rejection into a message.
 */
export function isUniqueViolation(error: UnknownError): boolean {
  return asErrorShape(error).code === '23505'
}

/** True for connectivity failures, which deserve a Retry rather than an apology. */
export function isNetworkError(error: UnknownError): boolean {
  const { message, name } = asErrorShape(error)
  if (name === 'AbortError') return true
  if (!message) return false
  return /fetch|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(message)
}

/**
 * Builds the safe, human sentence to show on screen.
 *
 * Deliberately says little: the detail belongs in the log, keyed by the same action.
 */
export function toUserMessage(error: UnknownError): string {
  if (isInsufficientStock(error)) {
    const available = parseAvailableQty(error)
    return available === null
      ? 'Not enough stock to complete this.'
      : `Only ${available} left in stock.`
  }

  if (isNetworkError(error)) {
    return 'Cannot reach the server. Check your connection and try again.'
  }

  return 'Something went wrong. Please try again.'
}

/** Builds the log payload. Ids and codes only — never a token or a full record. */
export function toLogContext(error: UnknownError): Record<string, string> {
  const { message, code, details, name } = asErrorShape(error)

  return {
    ...(name ? { errorName: name } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(details ? { details } : {})
  }
}
