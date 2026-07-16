import { Search } from 'lucide-react'

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
    <header className="drag-region flex h-12 shrink-0 items-center gap-4 hairline-b px-container pr-[140px]">
      <div className="no-drag relative w-full max-w-md">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline-variant"
          strokeWidth={1.5}
        />
        <input
          aria-label="Search inventory"
          className="h-8 w-full rounded-xl border border-outline-variant bg-surface-container-lowest/50 pl-9 pr-4 text-body-md text-on-surface placeholder:text-outline-variant disabled:cursor-not-allowed disabled:opacity-50"
          disabled
          placeholder="Search inventory, shipments…"
          type="search"
        />
      </div>
    </header>
  )
}
