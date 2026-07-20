import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

/** Buttons are strictly pill-shaped (DESIGN.md) to distinguish them from data containers. */
const VARIANTS = {
  primary: 'bg-primary-container text-on-primary-container hover:bg-on-primary-fixed-variant',
  secondary:
    'border border-border text-on-surface hover:bg-surface-variant/30 bg-transparent',
  ghost: 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface',
  danger: 'bg-error-container text-on-error-container hover:bg-error-container/80'
} as const

const SIZES = {
  sm: 'h-8 px-4 text-body-sm',
  md: 'h-10 px-6 text-body-md',
  lg: 'h-12 px-8 text-body-md'
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  /** Shows a spinner and blocks input. See the note on double-submits below. */
  isLoading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

/**
 * The app's only button.
 *
 * `isLoading` disables the button as well as showing a spinner. This is not cosmetic: an
 * enabled button during an in-flight save lets a double-click post two outwards, which is
 * the single most expensive bug this app can have. Pass it for every mutation.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || isLoading

  return (
    <button
      aria-busy={isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
        'transition-all duration-150 active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={isDisabled}
      type={type}
      {...rest}
    >
      {isLoading ? <Spinner label={null} size="sm" className="text-current" /> : icon}
      {children}
    </button>
  )
}
