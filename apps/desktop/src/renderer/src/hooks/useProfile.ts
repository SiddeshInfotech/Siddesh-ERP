import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

export type AppRole = 'ADMIN' | 'STORE_MANAGER' | 'SALES_EXECUTIVE'

export interface CurrentProfile {
  id: string
  fullName: string
  role: AppRole
  officeId: string | null
  officeName: string | null
  officeCode: string | null
}

interface OfficeEmbed {
  name: string
  code: string
}

/** Supabase types a to-one embed loosely; narrow it to the single related row (or null). */
function readOffice(embed: unknown): OfficeEmbed | null {
  const value = Array.isArray(embed) ? embed[0] : embed
  if (value && typeof value === 'object' && 'name' in value && 'code' in value) {
    return value as OfficeEmbed
  }
  return null
}

/**
 * The logged-in user's business identity — role and office — from `public.profiles`.
 *
 * `auth.users` (via {@link useAuth}) knows only the email; the role and office live in
 * `profiles`, which RLS lets a user read for their own row. Every office-scoping decision in
 * the UI (is this an Admin? which office label to show) reads from HERE — never from
 * `user_metadata`, which a client can set and so must never be trusted for authorization.
 *
 * @returns The TanStack query plus `profile` (null until loaded) and an `isAdmin` shortcut.
 */
export function useProfile() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const query = useQuery({
    queryKey: ['profile', userId],
    enabled: userId !== null,
    // Role/office effectively never change within a session; avoid refetching on every screen.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CurrentProfile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, office_id, offices(name, code)')
        .eq('id', userId as string)
        .single()

      if (error) {
        logger.error('Could not load current profile', toLogContext(error))
        throw error
      }

      const office = readOffice(data.offices)
      return {
        id: data.id,
        fullName: data.full_name,
        role: data.role,
        officeId: data.office_id,
        officeName: office?.name ?? null,
        officeCode: office?.code ?? null
      }
    }
  })

  return {
    ...query,
    profile: query.data ?? null,
    isAdmin: query.data?.role === 'ADMIN'
  }
}
