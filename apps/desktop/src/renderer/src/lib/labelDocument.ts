import { toSvgMarkup } from './barcode'

/**
 * Builds the printable barcode-label document (SRD §9, DSK-213, DSK-214).
 *
 * Pure: takes values, returns an HTML string. It performs no printing and touches no window —
 * that side effect belongs to `usePrintLabels`, so this stays trivially inspectable.
 */

export interface LabelSize {
  id: string
  label: string
  widthMm: number
  heightMm: number
}

/**
 * The stock sizes on the shelf. Thermal 50×25 is the everyday roll; 100×50 is the 4"×2"
 * sheet the Stitch mock shows.
 */
export const LABEL_SIZES: LabelSize[] = [
  { id: '50x25', label: '50 × 25 mm — thermal roll', widthMm: 50, heightMm: 25 },
  { id: '100x50', label: '100 × 50 mm — 4" × 2"', widthMm: 100, heightMm: 50 },
  { id: '38x19', label: '38 × 19 mm — small', widthMm: 38, heightMm: 19 }
]

export const DEFAULT_LABEL_SIZE = LABEL_SIZES[0] as LabelSize

/** One label per sheet, so a 10-copy print is 10 pages the printer feeds as 10 labels. */
export const MAX_COPIES = 200

/**
 * Escapes text destined for HTML.
 *
 * The product name is user-entered and goes into a document we build by string concatenation,
 * so a name containing `<` would otherwise break the label — or inject markup into it.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface LabelDocumentInput {
  productName: string
  code: string
  copies: number
  size: LabelSize
}

/**
 * Renders `copies` identical labels as a standalone HTML document.
 *
 * @throws When `code` cannot be encoded as Code 128 (from `toSvgMarkup`). Refusing to build
 *         the document is deliberate: a label that prints wrong bars gets stuck on a box and
 *         is discovered months later at a school.
 *
 * The barcode is inlined as SVG rather than an <img>: it stays sharp at any printer DPI, and
 * the document loads no external resource, which the app's CSP forbids anyway.
 */
export function buildLabelDocument({ productName, code, copies, size }: LabelDocumentInput): string {
  // Bars must be tall enough for a handheld scanner to read at an angle, but the name and the
  // digits also have to fit, so height follows the label rather than a fixed guess.
  const barcodeHeight = Math.round(size.heightMm * 1.6)
  const svg = toSvgMarkup(code, { showText: true, barWidth: 2, height: barcodeHeight })

  const label = `
      <div class="label">
        <div class="name">${escapeHtml(productName)}</div>
        <div class="bars">${svg}</div>
      </div>`

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(productName)} — ${escapeHtml(code)}</title>
    <style>
      /* Exact label stock, no printer margin: the label IS the page. */
      @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }

      * { box-sizing: border-box; }
      body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }

      .label {
        width: ${size.widthMm}mm;
        height: ${size.heightMm}mm;
        padding: 1.5mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1mm;
        /* Every label but the last starts a new page, so one copy = one label. */
        page-break-after: always;
        break-after: page;
        overflow: hidden;
      }
      .label:last-child { page-break-after: auto; break-after: auto; }

      .name {
        font-size: 7pt;
        font-weight: 700;
        text-align: center;
        line-height: 1.1;
        max-width: 100%;
        /* A 200-character product name must not push the bars off the label. */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .bars svg { max-width: 100%; height: auto; display: block; }
    </style>
  </head>
  <body>${label.repeat(copies)}</body>
</html>`
}
