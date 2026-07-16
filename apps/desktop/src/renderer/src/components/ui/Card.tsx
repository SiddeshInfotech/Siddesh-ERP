import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CardProps {
  children: ReactNode
  className?: string
  /** Level 2 — modals and popovers. Higher border opacity, deeper ambient blur. */
  elevated?: boolean
}

/**
 * Glass panel — Level 1 of the elevation model.
 *
 * Depth here comes from translucent stacking and a backdrop blur, never a drop shadow
 * (DESIGN.md). Everything that floats above the base canvas is one of these.
 */
export function Card({ children, className, elevated = false }: CardProps) {
  return (
    <div className={cn(elevated ? 'glass-elevated' : 'glass', 'rounded-xl', className)}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  /** Right-aligned affordance — a "View All" link, a filter, an action. */
  action?: ReactNode
  icon?: ReactNode
}

/** Standard card header: 20px semibold title, optional icon, optional right-side action. */
export function CardHeader({ title, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between hairline-b px-5 py-4">
      <h2 className="flex items-center gap-2 text-h2 text-on-surface">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  )
}
