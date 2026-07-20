import { useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  /** Always required. A placeholder is not a label. */
  label: string
  error?: string
  hint?: string
  containerClassName?: string
}

/**
 * Labelled multi-line input — product descriptions, notes, reasons.
 *
 * Mirrors `Field` in every respect except height, so a form reads as one control set rather
 * than two families of box.
 */
export function Textarea({
  label,
  error,
  hint,
  className,
  containerClassName,
  required,
  rows = 3,
  ...rest
}: TextareaProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={cn('flex flex-col', containerClassName)}>
      <label className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant" htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>

      <textarea
        aria-describedby={describedBy}
        aria-invalid={error !== undefined}
        className={cn(
          'w-full resize-y rounded-xl border bg-surface-container-lowest/50 px-4 py-2.5',
          'text-on-surface placeholder:text-outline',
          'transition-all focus:border-primary-container',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-error/50' : 'border-border',
          className
        )}
        id={id}
        required={required}
        rows={rows}
        {...rest}
      />

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
