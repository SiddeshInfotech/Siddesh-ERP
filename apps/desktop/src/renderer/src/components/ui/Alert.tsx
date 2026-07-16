import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type AlertTone = 'error' | 'success' | 'warning' | 'info'

const TONES = {
  error: {
    icon: XCircle,
    box: 'bg-error-container/20 border-error/30',
    text: 'text-error'
  },
  success: {
    icon: CheckCircle2,
    box: 'bg-success-container/20 border-success/30',
    text: 'text-success'
  },
  warning: {
    icon: AlertTriangle,
    box: 'bg-tertiary-container/20 border-tertiary/30',
    text: 'text-tertiary'
  },
  info: {
    icon: Info,
    box: 'bg-secondary-container/20 border-secondary/30',
    text: 'text-secondary'
  }
} as const

interface AlertProps {
  tone?: AlertTone
  children: ReactNode
  /** Renders a retry affordance. Use for failures the user can actually recover from. */
  action?: ReactNode
  className?: string
  /** Adds a shake animation. For a rejected submit, where the field is already on screen. */
  shake?: boolean
}

/**
 * Inline message box — the single way this app reports an outcome in place.
 *
 * Pass an already-safe sentence (see `lib/errors.toUserMessage`). Never pass a raw
 * Postgres error: it is unreadable to a storekeeper and leaks schema names.
 *
 * `role` is chosen by tone: failures assert (interrupting the screen reader), everything
 * else is polite.
 */
export function Alert({ tone = 'info', children, action, className, shake = false }: AlertProps) {
  const { icon: Icon, box, text } = TONES[tone]

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3',
        box,
        shake && 'shake',
        className
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" className={cn('size-[18px] shrink-0', text)} strokeWidth={1.5} />
      <span className={cn('flex-1 text-body-sm font-semibold', text)}>{children}</span>
      {action}
    </div>
  )
}
