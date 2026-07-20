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

export type BarcodeFormatId = 'ST_STANDARD' | 'SKU_DATE_SEQ' | 'CAT_YEAR_SEQ' | 'CUSTOM_PREFIX'

export interface BarcodeFormatOption {
  id: BarcodeFormatId
  name: string
  example: string
  patternDescription: string
  parts: { label: string; description: string; color: string; example: string }[]
}

export const BARCODE_FORMAT_OPTIONS: BarcodeFormatOption[] = [
  {
    id: 'ST_STANDARD',
    name: 'Standard ST Sequential (ST00000001)',
    example: 'ST00000001',
    patternDescription: '[PREFIX ST] + [8-DIGIT SERIAL NUMBER]',
    parts: [
      { label: 'ST', description: 'Storekeeper System Prefix', color: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30', example: 'ST' },
      { label: '00000001', description: 'Global Unique Unit Serial Number', color: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30', example: '00000001' }
    ]
  },
  {
    id: 'SKU_DATE_SEQ',
    name: 'Product SKU + Batch Date + Unit Serial (PEN-260720-0001)',
    example: 'PEN-260720-0001',
    patternDescription: '[SKU CODE] - [YYMMDD DATE] - [4-DIGIT SERIAL]',
    parts: [
      { label: 'PEN', description: 'Product Short SKU Code', color: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30', example: 'PEN' },
      { label: '260720', description: 'Batch Creation Date (YYMMDD)', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30', example: '260720' },
      { label: '0001', description: 'Unit Serial Number in Batch', color: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30', example: '0001' }
    ]
  },
  {
    id: 'CAT_YEAR_SEQ',
    name: 'Category + Year + Unit Serial (DIG-2026-000001)',
    example: 'DIG-2026-000001',
    patternDescription: '[CATEGORY CODE] - [YYYY YEAR] - [6-DIGIT SERIAL]',
    parts: [
      { label: 'DIG', description: '3-Letter Category Abbreviation', color: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30', example: 'DIG' },
      { label: '2026', description: 'Manufacturing Year (YYYY)', color: 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30', example: '2026' },
      { label: '000001', description: 'Unit Serial Number', color: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30', example: '000001' }
    ]
  },
  {
    id: 'CUSTOM_PREFIX',
    name: 'Custom Prefix + Sequential Number (SIDD-000001)',
    example: 'SIDD-000001',
    patternDescription: '[CUSTOM PREFIX] - [6-DIGIT SERIAL NUMBER]',
    parts: [
      { label: 'SIDD', description: 'Custom Defined Organization Prefix', color: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30', example: 'SIDD' },
      { label: '000001', description: 'Sequential Serial Number', color: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30', example: '000001' }
    ]
  }
]

export function generateCustomBarcodeSequence(
  formatId: BarcodeFormatId,
  startSeq: number,
  count: number,
  options?: {
    skuCode?: string
    categoryName?: string
    customPrefix?: string
    date?: Date
  }
): string[] {
  const safeCount = Math.max(1, count)
  const result: string[] = []
  const dateObj = options?.date || new Date()
  
  // Format YYMMDD
  const yymmdd = [
    String(dateObj.getFullYear()).slice(2),
    String(dateObj.getMonth() + 1).padStart(2, '0'),
    String(dateObj.getDate()).padStart(2, '0')
  ].join('')

  const yearYYYY = String(dateObj.getFullYear())
  
  const sku = (options?.skuCode || 'PROD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PROD'
  const cat = (options?.categoryName || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'GEN'
  const customPre = (options?.customPrefix || 'SIDD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SIDD'

  for (let i = 0; i < safeCount; i++) {
    const seqNum = startSeq + i
    switch (formatId) {
      case 'SKU_DATE_SEQ':
        result.push(`${sku}-${yymmdd}-${String(seqNum).padStart(4, '0')}`)
        break
      case 'CAT_YEAR_SEQ':
        result.push(`${cat}-${yearYYYY}-${String(seqNum).padStart(6, '0')}`)
        break
      case 'CUSTOM_PREFIX':
        result.push(`${customPre}-${String(seqNum).padStart(6, '0')}`)
        break
      case 'ST_STANDARD':
      default:
        result.push(formatBarcodeNumber(seqNum, 'ST'))
        break
    }
  }

  return result
}


