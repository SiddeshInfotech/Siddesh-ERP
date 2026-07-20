// 2. External packages
import jsPDF from 'jspdf'

// 4. Local — absolute alias before relative
import { getCode128Modules } from '@/lib/code128'

/** One printable label: a barcode plus the human-readable metadata around it. */
export interface LabelData {
  barcode: string
  productName: string
  categoryOrModel?: string
  brand?: string
}

/** Grid of labels that tiles a single A4 sheet. `cols * rows` = labels per page. */
export interface LabelLayout {
  cols: number
  rows: number
}

// A4 geometry, in millimetres — jsPDF is created with unit: 'mm'.
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const PAGE_MARGIN_MM = 6
const CELL_GAP_MM = 2
const CELL_PADDING_MM = 2

// Points per millimetre — jsPDF font sizes are in points, layout maths is in mm.
const PT_PER_MM = 72 / 25.4

// Palette (Tailwind slate), as RGB triples for jsPDF's numeric colour setters.
const COLOR_BARS: [number, number, number] = [9, 9, 11] // slate-950
const COLOR_BORDER: [number, number, number] = [203, 213, 225] // slate-300
const COLOR_NAME: [number, number, number] = [15, 23, 42] // slate-900
const COLOR_MUTED: [number, number, number] = [100, 116, 139] // slate-500
const COLOR_CODE: [number, number, number] = [30, 41, 59] // slate-800

/**
 * Builds a print-ready, fully vector A4 PDF of Code 128 barcode labels.
 *
 * The grid fills the entire printable area of each sheet: a 3×8 layout places 24
 * evenly sized labels per page, a 4×12 layout places 48, and so on. Barcodes are
 * drawn as vector rectangles — never a rasterised image — so they stay sharp at
 * any zoom and scan reliably. Every `cols * rows` labels begin a new physical
 * page, giving exact page breaks.
 *
 * @param items - Labels in print order. An empty array yields one blank page.
 * @param layout - Grid dimensions (columns × rows per sheet); each ≥ 1.
 * @returns A jsPDF document ready to `.save()` or serialise to a blob.
 */
export function buildBarcodeLabelsPdf(items: LabelData[], layout: LabelLayout): jsPDF {
  const cols = Math.max(1, layout.cols)
  const rows = Math.max(1, layout.rows)
  const perPage = cols * rows

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const usableW = A4_WIDTH_MM - PAGE_MARGIN_MM * 2
  const usableH = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2
  const cellW = (usableW - CELL_GAP_MM * (cols - 1)) / cols
  const cellH = (usableH - CELL_GAP_MM * (rows - 1)) / rows

  const pageCount = Math.max(1, Math.ceil(items.length / perPage))

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage('a4', 'portrait')

    const pageItems = items.slice(page * perPage, page * perPage + perPage)
    pageItems.forEach((item, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const x = PAGE_MARGIN_MM + col * (cellW + CELL_GAP_MM)
      const y = PAGE_MARGIN_MM + row * (cellH + CELL_GAP_MM)
      drawLabelCell(pdf, item, x, y, cellW, cellH)
    })
  }

  return pdf
}

/** Draws one label — border, header, vector barcode, human-readable code — into `cellW × cellH`. */
function drawLabelCell(
  pdf: jsPDF,
  item: LabelData,
  x: number,
  y: number,
  cellW: number,
  cellH: number
): void {
  // Cell border.
  pdf.setDrawColor(...COLOR_BORDER)
  pdf.setLineWidth(0.2)
  pdf.roundedRect(x, y, cellW, cellH, 1, 1, 'S')

  const innerX = x + CELL_PADDING_MM
  const innerW = cellW - CELL_PADDING_MM * 2
  const innerTop = y + CELL_PADDING_MM
  const innerBottom = y + cellH - CELL_PADDING_MM

  // Font sizes scale with the cell so 48-per-page stays legible and 12-per-page
  // does not look sparse. Clamped to a sane print range.
  const headerPt = clamp(cellH * 0.62, 5, 8)
  const codePt = clamp(cellH * 0.66, 5.5, 9)
  const headerH = headerPt / PT_PER_MM
  const codeH = codePt / PT_PER_MM

  // Header: product name (left) + brand/category (right).
  const brand = (item.brand || item.categoryOrModel || 'SIDDESH').toUpperCase()
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(headerPt)
  pdf.setTextColor(...COLOR_NAME)
  pdf.text(truncateToWidth(pdf, item.productName, innerW * 0.6), innerX, innerTop, {
    baseline: 'top'
  })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(headerPt - 0.5)
  pdf.setTextColor(...COLOR_MUTED)
  pdf.text(truncateToWidth(pdf, brand, innerW * 0.38), innerX + innerW, innerTop, {
    baseline: 'top',
    align: 'right'
  })

  // Barcode band: everything between the header and the code text.
  const barsTop = innerTop + headerH + 0.8
  const barsBottom = innerBottom - codeH - 0.8
  const barsH = barsBottom - barsTop

  const modules = getCode128Modules(item.barcode, 8)
  if (modules.length > 0 && barsH > 1) {
    const moduleW = innerW / modules.length
    pdf.setFillColor(...COLOR_BARS)
    let cursor = innerX
    for (let i = 0; i < modules.length; i++) {
      if (modules[i]) {
        let runLength = 1
        while (i + 1 < modules.length && modules[i + 1]) {
          runLength++
          i++
        }
        pdf.rect(cursor, barsTop, runLength * moduleW, barsH, 'F')
        cursor += runLength * moduleW
      } else {
        cursor += moduleW
      }
    }
  }

  // Human-readable code, centred under the bars.
  pdf.setFont('courier', 'normal')
  pdf.setFontSize(codePt)
  pdf.setTextColor(...COLOR_CODE)
  pdf.text(truncateToWidth(pdf, item.barcode, innerW), innerX + innerW / 2, innerBottom, {
    baseline: 'bottom',
    align: 'center'
  })
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Trims `text` with an ellipsis so it fits `maxWidth` mm at the pdf's *current*
 * font. Set the font and size before calling — `getTextWidth` reads both.
 */
function truncateToWidth(pdf: jsPDF, text: string, maxWidth: number): string {
  if (!text) return ''
  if (pdf.getTextWidth(text) <= maxWidth) return text
  let trimmed = text
  while (trimmed.length > 1 && pdf.getTextWidth(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed}…`
}
