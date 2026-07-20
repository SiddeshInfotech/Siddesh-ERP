import JsBarcode from 'jsbarcode'

/**
 * Barcode encoding and validation (SRD §4, §9, §17).
 *
 * Code 128 is the SRD's stated preference (§17). It encodes the full ASCII range and is what
 * every USB keyboard-emulation scanner in the three offices already reads.
 *
 * Pure module: no React, no I/O. `renderInto` touches an SVG node the caller owns.
 */

/** Our own generated SKUs, e.g. ST00000123 (SRD §4 Option A). */
const GENERATED_SKU = /^ST\d{8}$/

/**
 * Matches `chk_barcode_code` in 03_products.sql: length(trim(code)) between 4 and 64.
 * Kept in sync deliberately — the server re-checks, this is only to fail fast for the user.
 */
const MIN_LENGTH = 4
const MAX_LENGTH = 64

/** Code 128 encodes ASCII 0–127. A pasted "µ" or a smart quote cannot be represented. */
const ENCODABLE = /^[\x20-\x7E]+$/

/** True for a code this software generated, as opposed to one pasted off a supplier's box. */
export function isGeneratedSku(code: string): boolean {
  return GENERATED_SKU.test(code.trim())
}

export type BarcodeProblem =
  | { kind: 'EMPTY' }
  | { kind: 'TOO_SHORT'; min: number }
  | { kind: 'TOO_LONG'; max: number }
  | { kind: 'UNENCODABLE' }

/**
 * Validates a manufacturer barcode before it reaches the database (SRD §4 Option B).
 *
 * @returns null when the code is usable, otherwise the reason.
 *
 * Client-side validation is UX, not security: `uq_product_barcode_code` and the CHECK
 * constraint are what actually guarantee this. Duplicates are NOT detected here — only the
 * unique index can decide that, and only at the moment of writing.
 */
export function findBarcodeProblem(code: string): BarcodeProblem | null {
  const trimmed = code.trim()

  if (trimmed.length === 0) return { kind: 'EMPTY' }
  if (trimmed.length < MIN_LENGTH) return { kind: 'TOO_SHORT', min: MIN_LENGTH }
  if (trimmed.length > MAX_LENGTH) return { kind: 'TOO_LONG', max: MAX_LENGTH }
  if (!ENCODABLE.test(trimmed)) return { kind: 'UNENCODABLE' }

  return null
}

const PROBLEM_MESSAGES: Record<BarcodeProblem['kind'], string> = {
  EMPTY: 'Enter the barcode printed on the box.',
  TOO_SHORT: `A barcode must be at least ${MIN_LENGTH} characters.`,
  TOO_LONG: `A barcode cannot be longer than ${MAX_LENGTH} characters.`,
  UNENCODABLE: 'This barcode has characters a scanner cannot read. Type it exactly as printed.'
}

/** Turns a problem into the sentence shown under the field. */
export function describeBarcodeProblem(problem: BarcodeProblem): string {
  return PROBLEM_MESSAGES[problem.kind]
}

interface RenderOptions {
  /** Print the human-readable digits under the bars. Labels need this; previews may not. */
  showText?: boolean
  /** Bar width in px. 2 is the reliable floor for a thermal label at 203 dpi. */
  barWidth?: number
  height?: number
}

/**
 * Draws `code` into an existing SVG element as a Code 128 barcode.
 *
 * @param target - An SVG node the caller owns. Its contents are replaced.
 * @throws When `code` cannot be encoded — never render a barcode we cannot represent, because
 *         a wrong label is worse than no label once it is stuck on a box.
 *
 * `displayValue` renders the digits under the bars so a damaged label can still be typed in
 * by hand (SRD §5 step 2, and the manual-entry fallback the storekeeper needs).
 */
export function renderInto(target: SVGSVGElement, code: string, options: RenderOptions = {}): void {
  const { showText = true, barWidth = 2, height = 60 } = options

  JsBarcode(target, code.trim(), {
    format: 'CODE128',
    width: barWidth,
    height,
    displayValue: showText,
    fontOptions: 'bold',
    fontSize: 14,
    textMargin: 4,
    margin: 0,
    // Transparent: the label sheet is white, the on-screen preview sits on our own surface.
    background: 'transparent',
    lineColor: '#000000'
  })
}

/**
 * Renders a barcode to standalone SVG markup, for the print window.
 *
 * Printing opens a separate document that shares none of this app's React tree or CSS, so it
 * needs finished markup rather than a node reference.
 *
 * @throws When `code` cannot be encoded.
 */
export function toSvgMarkup(code: string, options: RenderOptions = {}): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  renderInto(svg, code, options)
  return svg.outerHTML
}
