import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

const SIZES = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8'
} as const

interface SpinnerProps {
  size?: keyof typeof SIZES
  className?: string
  /** Announced to screen readers. Set to null inside a button that already has a label. */
  label?: string | null
}

/**
 * Loading indicator.
 *
 * Shown whenever the app is waiting on the database, so it never looks frozen. Carries a
 * live-region label by default — a spinning icon alone tells a screen-reader user nothing.
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <>
      <Loader2
        aria-hidden="true"
        className={cn('animate-spin text-primary', SIZES[size], className)}
        strokeWidth={1.5}
      />
      {label ? (
        <span className="sr-only" role="status">
          {label}
        </span>
      ) : null}
    </>
  )
}

/** Full-pane loading state. Use where a whole screen or panel is pending. */
export function SpinnerPane({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3">
      <Spinner size="lg" label={null} />
      <p className="text-body-sm text-on-surface-variant/70" role="status">
        {label}
      </p>
    </div>
  )
}
