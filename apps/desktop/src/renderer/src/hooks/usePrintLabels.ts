import { useCallback, useState } from 'react'
import { buildLabelDocument, type LabelDocumentInput } from '@/lib/labelDocument'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Sends barcode labels to the printer (DSK-213, DSK-214).
 *
 * WHY AN IFRAME AND NOT window.open
 * main/index.ts installs `setWindowOpenHandler` → `shell.openExternal(url)` + deny, so every
 * `window.open` from this renderer is refused and handed to the user's real browser. The
 * usual "open a blank window, write the labels, print it" recipe would therefore print
 * nothing and pop open Chrome instead.
 *
 * A same-origin hidden iframe has no such handler in its way. It also inherits the app's CSP,
 * which the document already satisfies: inline <style> is covered by `style-src 'unsafe-inline'`,
 * the barcode is inline SVG, and it loads nothing external.
 */

/** Give the iframe a moment to lay out the SVG before the print dialog snapshots it. */
const LAYOUT_SETTLE_MS = 150

interface PrintState {
  isPrinting: boolean
  error: string | null
}

export function usePrintLabels() {
  const [state, setState] = useState<PrintState>({ isPrinting: false, error: null })

  const print = useCallback(async (input: LabelDocumentInput): Promise<void> => {
    setState({ isPrinting: true, error: null })

    // Declared out here so the finally block can always reclaim it.
    let frame: HTMLIFrameElement | null = null

    try {
      // Throws for an unencodable code — better here, before a printer is involved.
      const html = buildLabelDocument(input)

      frame = document.createElement('iframe')
      frame.setAttribute('aria-hidden', 'true')
      frame.setAttribute('title', 'Barcode labels')
      // Off-screen rather than display:none — a hidden frame has no layout, and a printed
      // document with no layout comes out blank.
      frame.style.cssText =
        'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;'
      document.body.appendChild(frame)

      const frameDocument = frame.contentDocument
      const frameWindow = frame.contentWindow
      if (!frameDocument || !frameWindow) {
        throw new Error('The print frame could not be created.')
      }

      frameDocument.open()
      frameDocument.write(html)
      frameDocument.close()

      await new Promise((resolve) => setTimeout(resolve, LAYOUT_SETTLE_MS))

      frameWindow.focus()
      // Blocks until the user finishes with the print dialog.
      frameWindow.print()

      logger.info('Labels sent to printer', { code: input.code, copies: input.copies })
      setState({ isPrinting: false, error: null })
    } catch (error) {
      logger.error('Could not print labels', { code: input.code, ...toLogContext(error) })
      setState({ isPrinting: false, error: 'Could not open the print dialog. Please try again.' })
    } finally {
      // Removing the frame immediately can cancel an in-flight print job on some drivers, so
      // it goes on the next tick — after the dialog has taken its copy of the document.
      const toRemove = frame
      if (toRemove !== null) setTimeout(() => toRemove.remove(), 0)
    }
  }, [])

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  return { print, isPrinting: state.isPrinting, error: state.error, clearError }
}
