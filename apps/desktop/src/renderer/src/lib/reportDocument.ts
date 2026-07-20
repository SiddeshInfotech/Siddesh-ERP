/**
 * Report export builders (DSK-413, DSK-414).
 *
 * Pure: takes rows, returns a string or a Blob. No printing, no downloads, no window — those
 * side effects live in `useExportReport`.
 */

export interface ReportColumn<Row> {
  header: string
  /** Cell value. Return a number for numeric columns so Excel keeps them numeric. */
  value: (row: Row) => string | number | null
  align?: 'left' | 'right'
}

export interface ReportMeta {
  title: string
  /** Shown under the title, e.g. "01 Jan 2026 – 31 Jan 2026". */
  subtitle?: string
}

/** Escapes text for the HTML print document. A product name containing `<` must not break it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function display(value: string | number | null): string {
  if (value === null) return '—'
  return String(value)
}

/**
 * Renders a report as a standalone, printable HTML document (DSK-414).
 *
 * PDF export is print-to-PDF rather than a bundled PDF library: Windows ships "Microsoft Print
 * to PDF", the system dialog gives Save-as-PDF for free, and the same document is what a user
 * would print on paper anyway. A PDF library would add megabytes to an .exe that goes to three
 * offices, to re-implement what the OS already does.
 *
 * Deliberately black-on-white regardless of the app's theme: this goes on paper, and the dark
 * theme would either waste toner or print as an unreadable grey.
 */
export function buildReportDocument<Row>(
  rows: Row[],
  columns: ReportColumn<Row>[],
  meta: ReportMeta
): string {
  const head = columns
    .map((column) => `<th class="${column.align === 'right' ? 'r' : ''}">${escapeHtml(column.header)}</th>`)
    .join('')

  const body = rows
    .map(
      (row) =>
        '<tr>' +
        columns
          .map(
            (column) =>
              `<td class="${column.align === 'right' ? 'r' : ''}">${escapeHtml(display(column.value(row)))}</td>`
          )
          .join('') +
        '</tr>'
    )
    .join('')

  const printedOn = new Date().toLocaleString('en-IN')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(meta.title)}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: system-ui, -apple-system, sans-serif; color: #000; margin: 0; }
      h1 { font-size: 16pt; margin: 0 0 2px; }
      .sub { font-size: 9pt; color: #444; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
      th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
      th { background: #eee; font-weight: 700; }
      /* Repeat the header on every printed page — a 200-row report is several pages, and a
         table whose columns are unlabelled after page 1 is unreadable. */
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
      .empty { padding: 24px; text-align: center; color: #666; font-size: 10pt; }
      .foot { margin-top: 8px; font-size: 7.5pt; color: #666; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(meta.title)}</h1>
    <div class="sub">Siddesh Technologies${meta.subtitle ? ` — ${escapeHtml(meta.subtitle)}` : ''}</div>
    ${
      rows.length === 0
        ? '<div class="empty">No records for this selection.</div>'
        : `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    }
    <div class="foot">${rows.length} record${rows.length === 1 ? '' : 's'} · printed ${escapeHtml(printedOn)}</div>
  </body>
</html>`
}

/** A filename that is safe on Windows and still says what the file is. */
export function toFileName(title: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${safe}-${stamp}.${extension}`
}
