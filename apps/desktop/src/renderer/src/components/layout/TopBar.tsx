
/**
 * Custom title bar + global search.
 *
 * The OS title bar is hidden (main/index.ts, titleBarStyle:'hidden'), so this strip IS the
 * title bar. Two consequences drive the markup:
 *
 *  1. `drag-region` — with no OS bar there is nothing to drag the window by. This strip
 *     provides it; interactive children opt back out with `no-drag`, or they turn into
 *     dead zones that move the window instead of taking a click.
 *  2. `pr-[140px]` — Windows still draws minimise/maximise/close over the top-right of our
 *     own background. That reserves their footprint (3 × ~46px) so nothing slides under
 *     buttons the user cannot see us covering.
 *
 * h-12 (48px) MUST match TITLE_BAR_HEIGHT in main/index.ts.
 */
export function TopBar() {
  return (
    <header className="drag-region pointer-events-none absolute inset-x-0 top-0 z-50 flex h-12 items-center gap-4 px-container pr-[140px]" />
  )
}
