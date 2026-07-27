import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export interface AlertOptions {
  title?: string
  description: ReactNode
  tone?: 'error' | 'warning' | 'info' | 'success'
  buttonText?: string
}

export interface AlertModalProps extends AlertOptions {
  isOpen: boolean
  onClose: () => void
}

export function AlertModal({
  isOpen,
  title = 'Notice',
  description,
  tone = 'warning',
  buttonText = 'OK',
  onClose
}: AlertModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const badgeIcon =
    tone === 'error' ? (
      <AlertCircle className="size-6" />
    ) : tone === 'warning' ? (
      <AlertTriangle className="size-6" />
    ) : tone === 'success' ? (
      <CheckCircle2 className="size-6" />
    ) : (
      <Info className="size-6" />
    )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl border border-outline-variant/30 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-on-surface-variant/60 transition-colors hover:bg-surface-variant/50 hover:text-on-surface"
          title="Close"
        >
          <X className="size-4" />
        </button>

        <div
          className={cn(
            'mx-auto flex size-12 items-center justify-center rounded-full mb-4 ring-8',
            tone === 'error'
              ? 'bg-error/15 text-error ring-error/5'
              : tone === 'warning'
                ? 'bg-warning/15 text-warning ring-warning/5'
                : tone === 'success'
                  ? 'bg-success/15 text-success ring-success/5'
                  : 'bg-primary/15 text-primary ring-primary/5'
          )}
        >
          {badgeIcon}
        </div>

        <div className="text-center">
          <h3 id="alert-modal-title" className="text-h3 font-bold text-on-surface">
            {title}
          </h3>
          <div className="mt-2 text-body-md text-on-surface-variant leading-relaxed whitespace-pre-wrap">
            {description}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center pt-2">
          <Button
            variant="primary"
            onClick={onClose}
            className={cn(
              'min-w-[120px] justify-center px-6 rounded-full font-semibold shadow-md active:scale-95',
              tone === 'error'
                ? 'bg-error text-white hover:bg-error/90 shadow-error/20'
                : tone === 'warning'
                  ? 'bg-warning text-on-surface hover:bg-warning/90 shadow-warning/20'
                  : tone === 'success'
                    ? 'bg-success text-white hover:bg-success/90 shadow-success/20'
                    : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
            )}
            autoFocus
          >
            {buttonText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
