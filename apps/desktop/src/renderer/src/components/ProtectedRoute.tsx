import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { SpinnerPane } from '@/components/ui/Spinner'
import { useAuth } from '@/hooks/useAuth'

/**
 * Gates everything behind a session (DSK-114).
 *
 * Waits for `isInitialising` before deciding. Skipping that wait would bounce an already
 * logged-in user to the login screen on every launch, because reading the stored session
 * from the OS keychain is asynchronous.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, isInitialising } = useAuth()
  const location = useLocation()

  if (isInitialising) return <SpinnerPane label="Starting up…" />

  if (session === null) {
    // `state` lets the login screen send the user back where they were headed.
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }

  return <>{children}</>
}
