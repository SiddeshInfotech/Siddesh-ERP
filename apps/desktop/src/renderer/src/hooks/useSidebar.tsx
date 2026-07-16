import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'siddesh.sidebar.collapsed'

interface SidebarState {
  isCollapsed: boolean
  toggleCollapsed: () => void
}

const SidebarContext = createContext<SidebarState | null>(null)

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Owns the sidebar's collapsed state.
 *
 * Persisted because it is a workspace preference: a storekeeper who collapses the nav to
 * fit a wide stock table expects it to stay collapsed tomorrow, not reset every launch.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(readStoredCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed))
    } catch {
      // Non-fatal: the preference just will not survive a restart.
    }
  }, [isCollapsed])

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((collapsed) => !collapsed)
  }, [])

  const value = useMemo<SidebarState>(
    () => ({ isCollapsed, toggleCollapsed }),
    [isCollapsed, toggleCollapsed]
  )

  return <SidebarContext value={value}>{children}</SidebarContext>
}

/** @throws When used outside SidebarProvider. */
export function useSidebar(): SidebarState {
  const context = useContext(SidebarContext)
  if (context === null) throw new Error('useSidebar must be used inside a SidebarProvider')
  return context
}
