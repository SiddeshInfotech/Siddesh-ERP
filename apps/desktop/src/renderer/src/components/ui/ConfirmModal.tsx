import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, HelpCircle, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export interface ConfirmOptions {
  title: string
  description: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: 'error' | 'warning' | 'default'
  icon?: ReactNode
  /** If set, requires user to type this exact code to enable confirm button. Default is '123Del' when tone is 'error'. */
  requireCode?: string | false
}

export interface ConfirmModalProps extends ConfirmOptions {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  tone = 'error',
  icon,
  requireCode,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const [code, setCode] = useState('')

  useEffect(() => {
    if (isOpen) {
      setCode('')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const badgeIcon = icon ?? (
    tone === 'error' ? (
      <Trash2 className="size-6" />
    ) : tone === 'warning' ? (
      <AlertTriangle className="size-6" />
    ) : (
      <HelpCircle className="size-6" />
    )
  )

  const buttonIcon = tone === 'error' ? <Trash2 className="size-4" /> : null

  const effectiveCode = requireCode !== undefined ? requireCode : (tone === 'error' ? '123Del' : false)
  const isConfirmDisabled = Boolean(effectiveCode) && code !== effectiveCode

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl border border-outline-variant/30 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <button
          type="button"
          onClick={onCancel}
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
                : 'bg-primary/15 text-primary ring-primary/5'
          )}
        >
          {badgeIcon}
        </div>

        <div className="text-center">
          <h3 id="confirm-modal-title" className="text-h3 font-bold text-on-surface">
            {title}
          </h3>
          <div className="mt-2 text-body-md text-on-surface-variant leading-relaxed whitespace-pre-wrap">
            {description}
          </div>
        </div>

        {effectiveCode ? (
          <div className="mt-5 text-left bg-surface-variant/20 p-3.5 rounded-xl border border-outline-variant/40">
            <label className="block text-body-sm font-semibold text-on-surface mb-2 flex items-center justify-between">
              <span>To confirm, type <strong className="font-mono bg-error/15 text-error px-2 py-0.5 rounded border border-error/20">{effectiveCode}</strong> below:</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isConfirmDisabled) {
                  e.stopPropagation()
                  onConfirm()
                }
              }}
              placeholder={`Type ${effectiveCode} to confirm`}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface focus:border-error focus:outline-none focus:ring-2 focus:ring-error/20 font-mono transition-all shadow-inner placeholder:text-on-surface-variant/40"
              autoFocus
            />
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-center gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            className="min-w-[100px] flex-1 justify-center"
            autoFocus={!effectiveCode}
          >
            {cancelText}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-body-sm font-semibold transition-all min-w-[120px] flex-1',
              isConfirmDisabled
                ? 'opacity-40 cursor-not-allowed bg-outline text-on-surface-variant shadow-none'
                : cn(
                    'active:scale-95 shadow-md',
                    tone === 'error'
                      ? 'bg-error text-white hover:bg-error/90 shadow-error/20'
                      : tone === 'warning'
                        ? 'bg-warning text-on-surface hover:bg-warning/90 shadow-warning/20'
                        : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
                  )
            )}
          >
            {buttonIcon}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
