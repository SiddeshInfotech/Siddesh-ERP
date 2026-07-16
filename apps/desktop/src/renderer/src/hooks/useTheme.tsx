import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { logger } from '@/lib/logger'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'siddesh.theme'

/**
 * Native title-bar overlay colours, per theme.
 *
 * These must track --color-background in styles.css. The window buttons are drawn by
 * Windows, not by us, so they cannot read a CSS variable — if these drift from the CSS,
 * the top-right corner ends up a different colour from the rest of the window, which is
 * exactly the seam the custom title bar exists to remove.
 */
const TITLE_BAR: Record<Theme, { color: string; symbolColor: string }> = {
  dark: { color: '#09090b', symbolColor: '#e5e1e4' },
  light: { color: '#f8fafc', symbolColor: '#1b1b1f' }
}

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeState | null>(null)

/** Reads the saved theme. Falls back to dark — the design system's primary mode. */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'dark'
  } catch {
    // localStorage can throw in a locked-down profile. A theme is not worth crashing over.
    return 'dark'
  }
}

/**
 * Owns light/dark for the whole window, including the native title-bar buttons.
 *
 * The theme is a display preference, not a secret, so localStorage is correct here —
 * unlike the auth session, which goes through the OS keychain.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    // The CSS keys off :root[data-theme='light']; dark is the default with no attribute.
    document.documentElement.dataset.theme = theme

    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Non-fatal: the theme just will not survive a restart.
    }

    // Repaint the Windows-drawn caption buttons to match.
    //
    // Optional-chained deliberately. `window.api` is injected by the preload script, so it
    // is absent whenever the renderer runs without one — a plain browser during debugging,
    // or a packaged build where the preload failed to load. A bare
    // `window.api.setTitleBarTheme()` throws a *synchronous* TypeError there, which no
    // .catch() can see; thrown from an effect in this provider — which sits above the
    // ErrorBoundary so the fallback screen is themed — it unmounts the app to a blank
    // white window with nothing logged. The title bar is cosmetic; never let it take the
    // app down.
    void window.api?.setTitleBarTheme?.(TITLE_BAR[theme])?.catch((error: unknown) => {
      logger.warn('Could not recolour the title bar overlay', {
        message: error instanceof Error ? error.message : String(error)
      })
    })
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo<ThemeState>(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext value={value}>{children}</ThemeContext>
}

/** @throws When used outside ThemeProvider. */
export function useTheme(): ThemeState {
  const context = useContext(ThemeContext)
  if (context === null) throw new Error('useTheme must be used inside a ThemeProvider')
  return context
}
