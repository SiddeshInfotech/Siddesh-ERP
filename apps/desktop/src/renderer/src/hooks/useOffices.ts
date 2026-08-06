import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/hooks/useProfile'

/**
 * Office management + team read for the Admin settings (client chat — Office/User Management).
 *
 * These are plain table writes, not RPCs: like products (see useProductMutations), an office
 * row needs no stock locking or ledger, and the `offices_write` / `profiles` RLS policies
 * already restrict every write here to an Admin. A non-admin's mutation is denied by the
 * database, not merely hidden in the UI.
 */

export interface OfficeRow {
  id: string
  code: string
  name: string
  /** Street address — the office's physical location (client chat 06/08/2026). */
  address: string | null
  city: string | null
  state: string | null
  gstNo: string | null
  isActive: boolean
}

export interface OfficeInput {
  code: string
  name: string
  address: string
  city: string
  state: string
  gstNo: string
}

export interface TeamMember {
  id: string
  fullName: string
  role: AppRole
  officeName: string | null
  isActive: boolean
}

/**
 * The shared Supabase-Auth account that represents one office (its "login").
 * Created in the Supabase Dashboard with is_office_login metadata; the app only
 * lists it. Kept out of {@link TeamMember} so office logins never clutter the
 * User Management list.
 */
export interface OfficeLoginAccount {
  id: string
  fullName: string
  officeId: string | null
  isActive: boolean
}

const OFFICES_KEY = ['offices'] as const
const TEAM_KEY = ['team'] as const
const OFFICE_LOGINS_KEY = ['office_logins'] as const

/** Trim a form value; an empty string becomes null so optional columns stay truly empty. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toInsert(input: OfficeInput) {
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    address: orNull(input.address),
    city: orNull(input.city),
    state: orNull(input.state),
    gst_no: orNull(input.gstNo)
  }
}

// Code is the office's stable human identifier (printed, referenced); it is not editable
// after creation, so an update never touches it.
function toUpdate(input: OfficeInput) {
  return {
    name: input.name.trim(),
    address: orNull(input.address),
    city: orNull(input.city),
    state: orNull(input.state),
    gst_no: orNull(input.gstNo)
  }
}

/** Every live office, alphabetical. Admin sees all; RLS returns exactly what the role may see. */
export function useOffices() {
  return useQuery({
    queryKey: OFFICES_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<OfficeRow[]> => {
      const { data, error } = await supabase
        .from('offices')
        .select('id, code, name, address, city, state, gst_no, is_active')
        .is('deleted_at', null)
        .order('name')

      if (error) {
        logger.error('Could not load offices', toLogContext(error))
        throw error
      }

      return data.map((o) => ({
        id: o.id,
        code: o.code,
        name: o.name,
        address: o.address,
        city: o.city,
        state: o.state,
        gstNo: o.gst_no,
        isActive: o.is_active
      }))
    }
  })
}

/**
 * Creates an office.
 *
 * @throws The raw Postgres error (unique/`check` violation) for the caller to map — a
 *         duplicate `code` surfaces as a 23505 the form turns into a friendly message.
 */
export function useCreateOffice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: OfficeInput): Promise<void> => {
      const { error } = await supabase.from('offices').insert(toInsert(input))
      if (error) {
        logger.error('Could not create office', toLogContext(error))
        throw error
      }
      logger.info('Office created', { code: input.code })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: OFFICES_KEY })
  })
}

/** Updates an office's editable details (name, city, state, GST) — never its code. */
export function useUpdateOffice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: OfficeInput }): Promise<void> => {
      const { error } = await supabase.from('offices').update(toUpdate(input)).eq('id', id)
      if (error) {
        logger.error('Could not update office', { officeId: id, ...toLogContext(error) })
        throw error
      }
      logger.info('Office updated', { officeId: id })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: OFFICES_KEY })
  })
}

/**
 * Activates or deactivates an office (client chat — Activate/Deactivate Office).
 *
 * Flips `is_active`; it never deletes. A deactivated office keeps its stock history — an
 * office that vanished would orphan every ledger row it owns, same reasoning as products.
 */
export function useSetOfficeActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }): Promise<void> => {
      const { error } = await supabase.from('offices').update({ is_active: isActive }).eq('id', id)
      if (error) {
        logger.error('Could not change office status', { officeId: id, ...toLogContext(error) })
        throw error
      }
      logger.info('Office status changed', { officeId: id, isActive })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: OFFICES_KEY })
  })
}

/**
 * Existing person logins, for the Admin User Management list (read-only).
 *
 * Creating a login is deliberately NOT here: it needs Supabase's Admin API (service_role),
 * which can never live in the client (rule 0.1 — the .exe is a public ZIP). New logins are
 * provisioned in the Supabase Dashboard; this hook only shows who already exists. Admin RLS
 * on `profiles` returns every row; a non-admin sees only their own.
 *
 * Office logins (`is_office_login`) are excluded — they are shown under Office Management,
 * not mixed into the people list (client chat 06/08/2026).
 */
export function useTeam() {
  return useQuery({
    queryKey: TEAM_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, is_active, offices(name)')
        // `is_office_login` is added by migration 45; the cast holds until db:types is
        // regenerated against it (same pattern as the untyped views in this codebase).
        .eq('is_office_login' as any, false)
        .is('deleted_at', null)
        .order('full_name')

      if (error) {
        logger.error('Could not load team members', toLogContext(error))
        throw error
      }

      return data.map((p) => {
        const office = Array.isArray(p.offices) ? p.offices[0] : p.offices
        return {
          id: p.id,
          fullName: p.full_name,
          role: p.role,
          officeName: (office as { name: string } | null)?.name ?? null,
          isActive: p.is_active
        }
      })
    }
  })
}

/**
 * The office-login accounts, keyed for display under each office.
 *
 * These are the shared Supabase-Auth accounts flagged `is_office_login`. Provisioned in the
 * Supabase Dashboard (the client, not the .exe, can create auth users); the app only lists
 * them so an admin can see which offices have a login set up. Admin RLS returns all rows.
 */
export function useOfficeLogins() {
  return useQuery({
    queryKey: OFFICE_LOGINS_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<OfficeLoginAccount[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, office_id, is_active')
        // See useTeam: cast until db:types picks up migration 45's is_office_login column.
        .eq('is_office_login' as any, true)
        .is('deleted_at', null)
        .order('full_name')

      if (error) {
        logger.error('Could not load office logins', toLogContext(error))
        throw error
      }

      return data.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        officeId: p.office_id,
        isActive: p.is_active
      }))
    }
  })
}
