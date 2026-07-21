import { useId, useRef, useState, useEffect, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface AutocompleteProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange'> {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  required?: boolean
  containerClassName?: string
}

export function Autocomplete({
  label,
  options,
  value,
  onChange,
  error,
  hint,
  required,
  containerClassName,
  className,
  ...rest
}: AutocompleteProps) {
  const id = useId()
  const listboxId = `${id}-listbox`
  const helperId = `${id}-helper`
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  
  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(value.toLowerCase()))
  const describedBy = error || hint ? helperId : undefined

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setIsOpen(true)
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && filteredOptions[activeIndex]) {
          onChange(filteredOptions[activeIndex])
          setIsOpen(false)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  return (
    <div className={cn('flex flex-col mb-1.5 relative', containerClassName)} ref={rootRef}>
      <label className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant" htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>

      <input
        aria-controls={isOpen ? listboxId : undefined}
        aria-describedby={describedBy}
        aria-expanded={isOpen}
        aria-invalid={error !== undefined}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-xl border px-4 outline-none',
          'bg-surface-container-lowest/50 text-body-md text-on-surface transition-all',
          'focus:border-primary-container focus:bg-surface-container-lowest',
          'placeholder:text-outline disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-error/50 focus:border-error' : 'border-border',
          className
        )}
        id={id}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(true)
          setActiveIndex(-1)
        }}
        onClick={() => setIsOpen(true)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        role="combobox"
        value={value}
        autoComplete="off"
        {...rest}
      />

      {isOpen && filteredOptions.length > 0 && (
        <ul
          className="glass-elevated pop-in absolute top-full z-[9999] mt-1.5 max-h-64 min-w-full overflow-auto rounded-2xl p-1.5 shadow-2xl backdrop-blur-3xl no-scrollbar"
          id={listboxId}
          role="listbox"
        >
          {filteredOptions.map((option, idx) => (
            <li
              aria-selected={idx === activeIndex}
              className={cn(
                'flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-body-md transition-colors',
                idx === activeIndex ? 'bg-primary-container/20 text-on-surface' : 'text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface'
              )}
              key={option}
              onClick={() => {
                onChange(option)
                setIsOpen(false)
                inputRef.current?.focus()
              }}
              onPointerEnter={() => setActiveIndex(idx)}
              role="option"
            >
              {option}
            </li>
          ))}
        </ul>
      )}

      {(error || hint) && (
        <p className={cn('ml-1 mt-1 text-body-sm', error ? 'text-error' : 'text-on-surface-variant/60')} id={helperId}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
