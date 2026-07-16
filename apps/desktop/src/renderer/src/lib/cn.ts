import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names, resolving Tailwind conflicts so the last one wins.
 *
 * Without twMerge, `cn('p-2', 'p-4')` emits both and the winner depends on CSS source
 * order — which makes component `className` overrides silently unreliable.
 *
 * @example cn('px-4 py-2', isActive && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
