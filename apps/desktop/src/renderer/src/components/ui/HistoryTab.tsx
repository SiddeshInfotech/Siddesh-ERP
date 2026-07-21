import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface HistoryTabProps {
  active: boolean
  onClick: () => void
  children: ReactNode
}

/**
 * Underline tab for a history table's view switcher (Inward / Outward).
 * Kept visually distinct from the pill filter buttons that sit beside it.
 */
export function HistoryTab({ active, onClick, children }: HistoryTabProps) {
  return (
    <button
      aria-selected={active}
      className={cn(
        'relative px-4 py-2.5 text-body-sm font-semibold transition-colors',
        active ? 'text-primary' : 'text-on-surface-variant/70 hover:text-on-surface'
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
      {active ? (
        <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  )
}
