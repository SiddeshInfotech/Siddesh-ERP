import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Always required. A placeholder is not a label — it vanishes the moment you type. */
  label: string
  /** Validation message. Presence switches the field to its error state. */
  error?: string
  /** Persistent helper text, shown when there is no error. */
  hint?: string
  /** Rendered on the right edge, inside the box (e.g. a show-password toggle). */
  adornment?: ReactNode
  /** Renders the value in JetBrains Mono. Use for barcodes, SKUs, serials. */
  mono?: boolean
  containerClassName?: string
}

/**
 * Labelled text input — the standard form control for the whole app.
 *
 * Wires label, hint, and error to the input via aria-describedby, so a screen-reader user
 * hears the error rather than only seeing a red border. `useId` keeps that association
 * correct even when the same field renders twice on one screen.
 */
export function Field({
  label,
  error,
  hint,
  adornment,
  mono = false,
  className,
  containerClassName,
  required,
  ...rest
}: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={cn('flex flex-col', containerClassName)}>
      <label
        className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
        htmlFor={id}
      >
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>

      <div className="relative">
        <input
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          className={cn(
            'h-10 w-full rounded-xl border bg-surface-container-lowest/50 px-4',
            'text-on-surface placeholder:text-outline',
            'transition-all focus:border-primary-container',
            'disabled:cursor-not-allowed disabled:opacity-50',
            mono && 'font-mono tracking-wide',
            error ? 'border-error/50' : 'border-border',
            adornment ? 'pr-11' : '',
            className
          )}
          id={id}
          required={required}
          {...rest}
        />
        {adornment ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{adornment}</div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1.5 ml-1 text-body-sm text-error" id={errorId}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 ml-1 text-body-sm text-on-surface-variant/60" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
