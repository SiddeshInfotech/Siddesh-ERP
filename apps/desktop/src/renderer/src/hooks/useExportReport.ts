import { useCallback, useState } from 'react'
// The package exposes no root export — only /node, /browser and /universal. The renderer is
// Chromium, so /browser is the right one: it streams straight to a download and pulls in no
// Node fs shim.
import writeXlsxFile from 'write-excel-file/browser'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  buildReportDocument,
  toFileName,
  type ReportColumn,
  type ReportMeta
} from '@/lib/reportDocument'

/**
 * Exports a report to Excel or PDF (DSK-413, DSK-414).
 *
 * Both side effects live here; the documents themselves are built by the pure
 * `lib/reportDocument`.
 */

/** Give the print frame a moment to lay the table out before the dialog snapshots it. */
const LAYOUT_SETTLE_MS = 200

interface ExportState {
  isExporting: boolean
  error: string | null
}

export function useExportReport() {
  const [state, setState] = useState<ExportState>({ isExporting: false, error: null })

  /**
   * Writes a real .xlsx (DSK-413).
   *
   * A true spreadsheet rather than a CSV: numeric columns stay numeric, so a storekeeper can
   * sum a quantity column without Excel first guessing at the text. CSV would also mangle a
   * product name containing a comma unless quoted exactly right.
   */
  const exportExcel = useCallback(
    async <Row,>(rows: Row[], columns: ReportColumn<Row>[], meta: ReportMeta): Promise<void> => {
      setState({ isExporting: true, error: null })

      try {
        await writeXlsxFile(rows, {
          columns: columns.map((column) => ({
            header: column.header,
            width: Math.max(12, Math.min(40, column.header.length + 8)),
            cell: (row: Row) => {
              const value = column.value(row)
              // A bare null is the library's own "empty cell". `{ value: null }` is NOT the
              // same thing — its `value` only accepts a String/Date/Number/Boolean — and
              // stringifying would write the literal text "null" into the sheet.
              if (value === null) return null
              if (typeof value === 'number') return { value, type: Number }
              return { value: String(value), type: String }
            }
          })),
          // Excel rejects a sheet name over 31 chars or containing : \ / ? * [ ]
          sheet: meta.title.replace(/[:\\/?*[\]]/g, '').slice(0, 31)
        }).toFile(toFileName(meta.title, 'xlsx'))

        logger.info('Report exported to Excel', { title: meta.title, rows: rows.length })
        setState({ isExporting: false, error: null })
      } catch (error) {
        logger.error('Excel export failed', { title: meta.title, ...toLogContext(error) })
        setState({ isExporting: false, error: 'Could not create the Excel file. Please try again.' })
      }
    },
    []
  )

  /**
   * Opens the print dialog with the report laid out for paper (DSK-414).
   *
   * "Microsoft Print to PDF" is how this becomes a PDF — Windows ships it, so Save-as-PDF and
   * printing on paper are the same action and neither costs the .exe a PDF library.
   *
   * Uses a hidden iframe, not window.open: main/index.ts routes every window.open to
   * `shell.openExternal` and denies it, so a print window would open the user's browser and
   * print nothing. Same reasoning as usePrintLabels.
   */
  const exportPdf = useCallback(
    async <Row,>(rows: Row[], columns: ReportColumn<Row>[], meta: ReportMeta): Promise<void> => {
      setState({ isExporting: true, error: null })

      let frame: HTMLIFrameElement | null = null

      try {
        const html = buildReportDocument(rows, columns, meta)

        frame = document.createElement('iframe')
        frame.setAttribute('aria-hidden', 'true')
        frame.setAttribute('title', meta.title)
        // Off-screen rather than display:none — a hidden frame has no layout, and a document
        // with no layout prints blank.
        frame.style.cssText =
          'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;'
        document.body.appendChild(frame)

        const frameDocument = frame.contentDocument
        const frameWindow = frame.contentWindow
        if (!frameDocument || !frameWindow) throw new Error('The print frame could not be created.')

        frameDocument.open()
        frameDocument.write(html)
        frameDocument.close()

        await new Promise((resolve) => setTimeout(resolve, LAYOUT_SETTLE_MS))

        frameWindow.focus()
        frameWindow.print()

        logger.info('Report sent to print/PDF', { title: meta.title, rows: rows.length })
        setState({ isExporting: false, error: null })
      } catch (error) {
        logger.error('PDF export failed', { title: meta.title, ...toLogContext(error) })
        setState({ isExporting: false, error: 'Could not open the print dialog. Please try again.' })
      } finally {
        // Next tick: removing the frame while the job is still spooling cancels it on some
        // drivers.
        const toRemove = frame
        if (toRemove !== null) setTimeout(() => toRemove.remove(), 0)
      }
    },
    []
  )

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  return { exportExcel, exportPdf, isExporting: state.isExporting, error: state.error, clearError }
}
