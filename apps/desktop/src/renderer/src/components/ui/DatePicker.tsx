import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface DatePickerProps {
  label: string
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  error?: string
  hint?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  containerClassName?: string
  className?: string
  /** Quick presets like Today, Yesterday, This Month */
  showPresets?: boolean
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

function formatIso(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return { year: y, month: m - 1, day: d }
}

function formatDisplayDate(iso: string): string {
  const parsed = parseIso(iso)
  if (!parsed) return ''
  const date = new Date(parsed.year, parsed.month, parsed.day)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Modern, attractive, and accessible DatePicker component.
 * Features a glassmorphism popover, interactive calendar grid, month/year navigation,
 * quick preset shortcuts, and animated selection states.
 */
export function DatePicker({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = 'Select date…',
  required,
  disabled = false,
  containerClassName,
  className,
  showPresets = true
}: DatePickerProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const [isOpen, setIsOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)

  // Current view year & month in calendar popover
  const parsedValue = useMemo(() => parseIso(value), [value])
  const today = useMemo(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }, [])

  const [viewYear, setViewYear] = useState<number>(parsedValue?.year ?? today.year)
  const [viewMonth, setViewMonth] = useState<number>(parsedValue?.month ?? today.month)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Sync view when selected value changes
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year)
      setViewMonth(parsedValue.month)
    }
  }, [parsedValue])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const open = useCallback(() => {
    if (disabled) return
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setDropUp(spaceBelow < 360 && spaceAbove > spaceBelow)
    }
    setIsOpen(true)
  }, [disabled])

  // Pointerdown outside to close
  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, close])

  // Calendar math
  const daysInMonth = useMemo(() => {
    return new Date(viewYear, viewMonth + 1, 0).getDate()
  }, [viewYear, viewMonth])

  const firstDayOfWeek = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).getDay()
  }, [viewYear, viewMonth])

  const prevMonthDays = useMemo(() => {
    const count = new Date(viewYear, viewMonth, 0).getDate()
    const days: number[] = []
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      days.push(count - i)
    }
    return days
  }, [viewYear, viewMonth, firstDayOfWeek])

  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  function handleSelectDay(day: number) {
    const iso = formatIso(viewYear, viewMonth, day)
    onChange(iso)
    close()
  }

  function handlePreset(preset: 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'clear') {
    const now = new Date()
    if (preset === 'today') {
      onChange(formatIso(now.getFullYear(), now.getMonth(), now.getDate()))
    } else if (preset === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      onChange(formatIso(y.getFullYear(), y.getMonth(), y.getDate()))
    } else if (preset === 'thisMonth') {
      onChange(formatIso(now.getFullYear(), now.getMonth(), 1))
    } else if (preset === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      onChange(formatIso(lm.getFullYear(), lm.getMonth(), 1))
    } else if (preset === 'clear') {
      onChange('')
    }
    close()
  }

  return (
    <div
      className={cn('flex flex-col mb-1.5', isOpen && 'relative z-[999]', containerClassName)}
      ref={rootRef}
    >
      <label
        className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
        htmlFor={id}
      >
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>

      <div className="relative">
        <button
          aria-describedby={describedBy}
          aria-expanded={isOpen}
          aria-invalid={error !== undefined}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-xl border px-3.5',
            'bg-surface-container-lowest/50 text-left transition-all duration-200',
            'focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-error/50' : isOpen ? 'border-primary-container ring-2 ring-primary-container/20' : 'border-border',
            className
          )}
          disabled={disabled}
          id={id}
          onClick={() => (isOpen ? close() : open())}
          ref={triggerRef}
          type="button"
        >
          <div className="flex items-center gap-2.5 truncate">
            <CalendarIcon className="size-4 shrink-0 text-primary-container" strokeWidth={1.75} />
            <span className={cn('truncate text-body-md', value ? 'font-medium text-on-surface' : 'text-outline')}>
              {value ? formatDisplayDate(value) : placeholder}
            </span>
          </div>

          {value && !disabled ? (
            <span
              aria-label="Clear date"
              className="rounded-full p-1 text-outline hover:bg-on-surface/10 hover:text-on-surface transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              role="button"
              tabIndex={0}
            >
              <X className="size-3.5" strokeWidth={2} />
            </span>
          ) : null}
        </button>

        {isOpen ? (
          <div
            className={cn(
              'glass-elevated animate-in fade-in-0 zoom-in-95 absolute z-[9999] w-80 rounded-2xl border border-border/80 bg-surface-container-low/95 p-4 shadow-2xl backdrop-blur-3xl',
              dropUp ? 'bottom-full mb-2 top-auto' : 'top-full mt-2'
            )}
          >
            {/* Header: Month / Year Navigation */}
            <div className="flex items-center justify-between gap-1 pb-3 hairline-b">
              <button
                className="flex size-8 items-center justify-center rounded-xl text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface transition-colors"
                onClick={handlePrevMonth}
                title="Previous month"
                type="button"
              >
                <ChevronLeft className="size-4" strokeWidth={2} />
              </button>

              <div className="flex items-center gap-1.5 font-semibold text-on-surface text-body-md">
                <span>{MONTH_NAMES[viewMonth]}</span>
                <span className="text-primary-container">{viewYear}</span>
              </div>

              <button
                className="flex size-8 items-center justify-center rounded-xl text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface transition-colors"
                onClick={handleNextMonth}
                title="Next month"
                type="button"
              >
                <ChevronRight className="size-4" strokeWidth={2} />
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 pt-3 pb-1.5 text-center font-bold text-[11px] uppercase tracking-wider text-on-surface-variant/60">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Previous Month Days (Grayed out) */}
              {prevMonthDays.map((day) => (
                <div
                  className="flex h-8 w-full items-center justify-center rounded-lg text-body-sm text-on-surface-variant/20 select-none cursor-default"
                  key={`prev-${day}`}
                >
                  {day}
                </div>
              ))}

              {/* Current Month Days */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const currentIso = formatIso(viewYear, viewMonth, day)
                const isSelected = value === currentIso
                const isToday =
                  today.year === viewYear && today.month === viewMonth && today.day === day

                return (
                  <button
                    className={cn(
                      'flex h-8 w-full items-center justify-center rounded-xl text-body-sm font-medium transition-all duration-150',
                      isSelected
                        ? 'bg-primary-container text-on-primary-container font-bold shadow-md shadow-primary-container/20 scale-105'
                        : isToday
                          ? 'border border-primary-container/60 text-primary-container font-bold hover:bg-primary-container/15'
                          : 'text-on-surface hover:bg-on-surface/10'
                    )}
                    key={day}
                    onClick={() => handleSelectDay(day)}
                    type="button"
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Presets / Quick Actions */}
            {showPresets ? (
              <div className="mt-3.5 pt-3 hairline-t flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                <div className="flex gap-1">
                  <button
                    className="rounded-lg bg-primary-container/10 px-2 py-1 font-semibold text-primary-container hover:bg-primary-container/20 transition-colors"
                    onClick={() => handlePreset('today')}
                    type="button"
                  >
                    Today
                  </button>
                  <button
                    className="rounded-lg bg-surface-container-high px-2 py-1 text-on-surface-variant hover:text-on-surface transition-colors"
                    onClick={() => handlePreset('yesterday')}
                    type="button"
                  >
                    Yesterday
                  </button>
                </div>

                <div className="flex gap-1">
                  <button
                    className="rounded-lg bg-surface-container-high px-2 py-1 text-on-surface-variant hover:text-on-surface transition-colors"
                    onClick={() => handlePreset('thisMonth')}
                    type="button"
                  >
                    This Month
                  </button>
                  {value ? (
                    <button
                      className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-on-surface-variant/70 hover:text-error transition-colors"
                      onClick={() => handlePreset('clear')}
                      title="Clear selection"
                      type="button"
                    >
                      <RotateCcw className="size-3" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
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
