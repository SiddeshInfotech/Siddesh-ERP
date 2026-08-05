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
        'relative px-4 py-1.5 rounded-full text-body-sm font-semibold transition-all',
        active ? 'bg-primary-container/15 text-primary' : 'text-on-surface-variant/70 hover:bg-on-surface/5 hover:text-on-surface'
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  )
}
