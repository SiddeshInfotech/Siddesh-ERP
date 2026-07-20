import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
  /** Optional second line, e.g. "Pieces" under "PCS". */
  description?: string
}

interface SelectProps {
  /** Always required. A placeholder is not a label. */
  label: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  /** Shown when nothing is chosen, and as a "clear" entry when the field is optional. */
  placeholder?: string
  error?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  containerClassName?: string
  className?: string
}

/**
 * Dropdown — the standard picker for the whole app (DSK-120, DSK-215).
 *
 * WHY NOT A NATIVE <select>
 * A native select is the more robust control and was the first implementation here, but its
 * `<option>` list is drawn by Windows, not by us: it cannot take our surface, border, radius
 * or type scale, so every dropdown in the app opened as a grey OS list that belonged to a
 * different product. Chromium ignores nearly all styling on `<option>`.
 *
 * So this is a real listbox, and it owes the platform everything the native control gave for
 * free — all of which is implemented below rather than skipped:
 *   • Enter / Space / Arrow / Alt+Arrow to open, Escape to close, Tab to leave
 *   • Arrow, Home, End to move; Enter to commit
 *   • Type-ahead ("p" jumps to PCS) — the thing keyboard users miss first
 *   • aria-activedescendant, so a screen reader follows the highlight without focus moving
 *   • Click-outside and scroll-into-view
 *
 * This app is driven by a keyboard and a scanner (SRD §8), so none of that is optional.
 */
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  hint,
  required,
  disabled = false,
  containerClassName,
  className
}: SelectProps) {
  const id = useId()
  const listboxId = `${id}-listbox`
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /** Type-ahead buffer. A ref, not state: it must not trigger a render on every keypress. */
  const typeAhead = useRef({ text: '', at: 0 })

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  )

  /** Placeholder doubles as the "none" choice, so an optional field can be un-set. */
  const entries = useMemo<SelectOption[]>(
    () => (placeholder === undefined ? options : [{ value: '', label: placeholder }, ...options]),
    [options, placeholder]
  )

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
    typeAhead.current = { text: '', at: 0 }
  }, [])

  const open = useCallback(() => {
    if (disabled) return
    setIsOpen(true)
    // Land on the current choice, not the top — the user is usually changing, not restarting.
    setActiveIndex(Math.max(0, entries.findIndex((entry) => entry.value === value)))
  }, [disabled, entries, value])

  const commit = useCallback(
    (index: number) => {
      const entry = entries[index]
      if (entry === undefined) return
      onChange(entry.value)
      close()
      triggerRef.current?.focus()
    },
    [entries, onChange, close]
  )

  // Close when the click lands anywhere else. pointerdown, not click: a click that starts
  // inside and ends outside should not count as an outside click.
  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, close])

  // Keep the highlighted row visible when arrowing through a long list.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeIndex])

  /** Jumps to the next option starting with what was typed. */
  function handleTypeAhead(char: string) {
    const now = Date.now()
    // A pause means a new search rather than a longer one. 800ms mirrors the OS behaviour.
    const text = now - typeAhead.current.at > 800 ? char : typeAhead.current.text + char
    typeAhead.current = { text, at: now }

    const match = entries.findIndex((entry) => entry.label.toLowerCase().startsWith(text))
    if (match >= 0) {
      setActiveIndex(match)
      if (!isOpen) onChange(entries[match]?.value ?? '')
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (disabled) return

    // A single printable character is type-ahead, never a shortcut.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === ' ' && !isOpen) {
        event.preventDefault()
        open()
        return
      }
      if (event.key !== ' ') {
        event.preventDefault()
        handleTypeAhead(event.key.toLowerCase())
        return
      }
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        if (isOpen) commit(activeIndex)
        else open()
        break
      case 'Escape':
        if (isOpen) {
          event.preventDefault()
          close()
        }
        break
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen) open()
        else setActiveIndex((index) => Math.min(index + 1, entries.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!isOpen) open()
        else setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        if (isOpen) {
          event.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (isOpen) {
          event.preventDefault()
          setActiveIndex(entries.length - 1)
        }
        break
      case 'Tab':
        // Tab commits nothing and closes — matching the native control.
        close()
        break
      default:
        break
    }
  }

  const activeId = activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined

  return (
    <div className={cn('flex flex-col', containerClassName)} ref={rootRef}>
      <label
        className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
        htmlFor={id}
      >
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>

      <div className="relative">
        <button
          aria-activedescendant={activeId}
          aria-controls={isOpen ? listboxId : undefined}
          aria-describedby={describedBy}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-invalid={error !== undefined}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-xl border px-4',
            'bg-surface-container-lowest/50 text-left transition-all',
            'focus:border-primary-container',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-error/50' : isOpen ? 'border-primary-container' : 'border-border',
            className
          )}
          disabled={disabled}
          id={id}
          onClick={() => (isOpen ? close() : open())}
          onKeyDown={handleKeyDown}
          ref={triggerRef}
          role="combobox"
          type="button"
        >
          <span
            className={cn('truncate', selected ? 'text-on-surface' : 'text-outline')}
          >
            {selected?.label ?? placeholder ?? 'Choose…'}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-outline transition-transform duration-150',
              isOpen && 'rotate-180'
            )}
            strokeWidth={1.5}
          />
        </button>

        {isOpen ? (
          <ul
            className="glass-elevated pop-in absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl p-1"
            id={listboxId}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
          >
            {entries.length === 0 ? (
              <li className="px-3 py-2 text-body-sm text-on-surface-variant/60">
                Nothing to choose from.
              </li>
            ) : (
              entries.map((entry, index) => {
                const isSelected = entry.value === value
                const isActive = index === activeIndex

                return (
                  <li
                    aria-selected={isSelected}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2',
                      'transition-colors',
                      isActive && 'bg-on-surface/10',
                      isSelected && 'text-primary'
                    )}
                    id={`${id}-option-${index}`}
                    key={entry.value || '__placeholder'}
                    // mousedown, not click: pointerdown-to-close would fire first otherwise.
                    onMouseDown={(event) => {
                      event.preventDefault()
                      commit(index)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          'truncate text-body-md',
                          entry.value === '' && 'text-on-surface-variant/60',
                          isSelected ? 'font-semibold' : 'text-on-surface'
                        )}
                      >
                        {entry.label}
                      </span>
                      {entry.description === undefined ? null : (
                        <span className="truncate text-body-sm text-on-surface-variant/60">
                          {entry.description}
                        </span>
                      )}
                    </span>

                    {isSelected ? (
                      <Check
                        aria-hidden="true"
                        className="size-4 shrink-0 text-primary"
                        strokeWidth={2}
                      />
                    ) : null}
                  </li>
                )
              })
            )}
          </ul>
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
