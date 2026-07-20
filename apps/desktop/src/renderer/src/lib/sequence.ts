/**
 * Barcode Sequence Helper Utility
 * Handles parsing, formatting, and generating sequential barcode ranges.
 */

/**
 * Extracts the numeric sequence value from a barcode string (e.g., "ST00000005" -> 5).
 */
export function extractSequenceNumber(barcode: string): number {
  if (!barcode) return 0
  const match = barcode.match(/\d+$/)
  return match ? parseInt(match[0], 10) : 0
}

/**
 * Formats a numeric sequence into standard 8-digit zero-padded ST barcode string.
 * Example: 5 -> "ST00000005"
 */
export function formatBarcodeNumber(seq: number, prefix: string = 'ST'): string {
  const padded = String(Math.max(1, seq)).padStart(8, '0')
  return `${prefix}${padded}`
}

/**
 * Generates an array of N sequential barcode strings starting from a given sequence number.
 * Example: generateBarcodeRange(5, 3) -> ["ST00000005", "ST00000006", "ST00000007"]
 */
export function generateBarcodeRange(startSeq: number, count: number, prefix: string = 'ST'): string[] {
  const safeCount = Math.max(1, count)
  const result: string[] = []
  for (let i = 0; i < safeCount; i++) {
    result.push(formatBarcodeNumber(startSeq + i, prefix))
  }
  return result
}

/**
 * Checks if a barcode is globally unique against an array of existing barcodes.
 */
export function isBarcodeUnique(barcode: string, existingList: string[]): boolean {
  if (!barcode || !barcode.trim()) return false
  const target = barcode.trim().toLowerCase()
  return !existingList.some((existing) => existing.trim().toLowerCase() === target)
}

