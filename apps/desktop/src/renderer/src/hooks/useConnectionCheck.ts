import { useQuery } from '@tanstack/react-query'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Proves the app can actually reach Supabase (DSK-104).
 *
 * Queries `offices` — the smallest real table (3 rows, seeded by BE-02) — with a head
 * count, so it transfers no rows. A "SELECT 1" would not prove RLS and the anon key work;
 * this does.
 *
 * Replace this on Day 2 with real product queries. It exists so the shell can show a
 * truthful connection state before any feature is built.
 */
export function useConnectionCheck() {
  return useQuery({
    queryKey: ['connection-check'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('offices')
        .select('*', { count: 'exact', head: true })

      if (error) {
        logger.error('Connection check failed', toLogContext(error))
        throw error
      }

      return count ?? 0
    },
    // A dead connection should surface fast, not after three silent backoffs.
    retry: 1,
    staleTime: 30_000
  })
}
