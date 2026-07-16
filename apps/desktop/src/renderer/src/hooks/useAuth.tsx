import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toLogContext, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  /** True until the stored session has been checked. Gates the whole app on first paint. */
  isInitialising: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Owns the auth session for the whole app.
 *
 * Session persistence (DSK-111) is handled by supabase-js writing through our secure
 * storage adapter — storekeepers should not log in twice a day. `onAuthStateChange` also
 * covers the token refreshing or being revoked while the app sits open all shift.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isInitialising, setIsInitialising] = useState(true)

  useEffect(() => {
    let isMounted = true

    // Reading the stored session is async (it round-trips to the OS keychain), so the app
    // must not decide "logged out" before this resolves — that would flash the login screen
    // at an already-authenticated user on every launch.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return
        setSession(data.session)
      })
      .catch((error: unknown) => {
        logger.error('Could not restore the stored session', toLogContext(error))
      })
      .finally(() => {
        if (isMounted) setIsInitialising(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return
      logger.info('Auth state changed', { event })
      setSession(nextSession)
    })

    // Guards against setState after unmount when a slow keychain read resolves late.
    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  /**
   * Signs in with email and password.
   *
   * @returns `{ error: null }` on success, or a safe message to show on the form.
   *
   * Never distinguishes "no such user" from "wrong password": that difference lets anyone
   * at the counter enumerate who works here.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (error) {
        logger.warn('Sign-in rejected', toLogContext(error))
        return { error: 'Invalid email or password' }
      }

      logger.info('Sign-in succeeded')
      return { error: null }
    } catch (error) {
      logger.error('Sign-in failed unexpectedly', toLogContext(error))
      return { error: toUserMessage(error) }
    }
  }, [])

  /** Signs out and clears the stored session. Always succeeds from the user's point of view. */
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      // Clearing local state matters more than the server round-trip: if the network is
      // down, the user still expects the app to lock.
      logger.error('Sign-out request failed; clearing local session anyway', toLogContext(error))
    } finally {
      setSession(null)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isInitialising,
      signIn,
      signOut
    }),
    [session, isInitialising, signIn, signOut]
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/**
 * Reads the auth session.
 *
 * @throws When used outside AuthProvider — a loud failure at first render beats a null
 *         session silently logging everyone out.
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (context === null) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
