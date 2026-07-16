import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import type { Database } from '@siddesh/shared'
import { logger } from './logger'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env, ' +
      'fill both in, then restart the dev server — Vite reads .env only at startup.'
  )
}

/**
 * Session storage backed by the OS keychain, via the preload bridge.
 *
 * Supabase defaults to localStorage, which on a shared office PC is a plaintext file any
 * user or script can read. This routes the token through Electron `safeStorage` instead,
 * encrypted against the Windows account.
 *
 * Supabase accepts an async storage adapter, so the IPC round-trip is fine here.
 */
const secureSessionStorage: SupportedStorage = {
  getItem: (key) => window.api.secureStore.get(key),
  setItem: async (key, value) => {
    try {
      await window.api.secureStore.set(key, value)
    } catch (error) {
      // Refusing to fall back to plaintext is deliberate. The user stays logged in for this
      // session; they just have to sign in again next launch.
      logger.error('Could not persist session to the OS keychain', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  },
  removeItem: (key) => window.api.secureStore.remove(key)
}

/**
 * The single Supabase client for the renderer.
 *
 * Anon key only. Everything in this file is bundled into the .exe and readable with
 * `npx asar extract`, so the service_role key must never appear here — RLS is the security
 * boundary, and writes go through the security-definer RPCs.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: secureSessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No OAuth redirects in a file:// desktop app — there is no URL to parse a token from.
    detectSessionInUrl: false
  }
})
