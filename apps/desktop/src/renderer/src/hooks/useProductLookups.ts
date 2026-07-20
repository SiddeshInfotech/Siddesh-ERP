import { useQuery } from '@tanstack/react-query'
import type { SelectOption } from '@/components/ui/Select'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Reference data for the product form's dropdowns (DSK-215, DSK-220).
 *
 * Categories, brands and units are normalised tables (03_products.sql), not enums, so the
 * pickers must read them rather than hardcode "AI Lab / Digital Products / Office Items".
 * Hardcoding would mean the list and the database drift the first time someone adds a
 * category, and the SRD §3 examples are examples, not a closed set.
 *
 * These change perhaps monthly, so they are cached hard — unlike stock, which is live.
 */
const LOOKUP_STALE_TIME = 10 * 60_000

/** Sorted for a human scanning a dropdown, not for the database's convenience. */
function toOptions(rows: { id: string; label: string; description?: string }[]): SelectOption[] {
  return rows
    .map((row) => ({ value: row.id, label: row.label, description: row.description }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: LOOKUP_STALE_TIME,
    queryFn: async (): Promise<SelectOption[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)

      if (error) {
        logger.error('Could not load categories', toLogContext(error))
        throw error
      }

      return toOptions(data.map((row) => ({ id: row.id, label: row.name })))
    }
  })
}

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    staleTime: LOOKUP_STALE_TIME,
    queryFn: async (): Promise<SelectOption[]> => {
      const { data, error } = await supabase.from('brands').select('id, name').eq('is_active', true)

      if (error) {
        logger.error('Could not load brands', toLogContext(error))
        throw error
      }

      return toOptions(data.map((row) => ({ id: row.id, label: row.name })))
    }
  })
}

export function useUoms() {
  return useQuery({
    queryKey: ['uoms'],
    staleTime: LOOKUP_STALE_TIME,
    queryFn: async (): Promise<SelectOption[]> => {
      const { data, error } = await supabase
        .from('uoms')
        .select('id, code, name')
        .eq('is_active', true)

      if (error) {
        logger.error('Could not load units', toLogContext(error))
        throw error
      }

      // The code is what a storekeeper says and what fits the table column; the name explains
      // it underneath, so "PCS" is never a guess.
      return toOptions(
        data.map((row) => ({ id: row.id, label: row.code, description: row.name }))
      )
    }
  })
}
