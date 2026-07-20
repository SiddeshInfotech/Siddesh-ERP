import { useQuery } from '@tanstack/react-query'
import type { ScanLookupResult } from '@siddesh/shared'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Resolves a scanned or typed barcode to a product (SRD §8, §13; DSK-302, DSK-303, DSK-311).
 *
 * WHY useQuery AND NOT useMutation
 * A lookup is a read, and keying it by the code buys two behaviours for free that this app
 * genuinely needs:
 *   • A scanner that fires the same code ten times a second produces ONE request — TanStack
 *     dedupes identical in-flight keys (§9 "scanner fires 10×/sec → exactly one lookup").
 *   • Re-scanning the same box is instant, from cache.
 *
 * The caller must only set `code` once per scan — on Enter, not on every keystroke. A USB
 * keyboard-emulation scanner types the digits then presses Enter, so committing on Enter is
 * both correct and what the hardware already does.
 */
export function useScanLookup(code: string | null) {
  return useQuery({
    queryKey: ['scan-lookup', code],
    enabled: code !== null && code.trim().length > 0,
    // A barcode resolves to the same product forever; only the stock figure moves, and the
    // screen re-reads that after every save.
    staleTime: 15_000,
    retry: 1,
    queryFn: async (): Promise<ScanLookupResult> => {
      const { data, error } = await supabase.rpc('scan_lookup', { p_code: code ?? '' })

      // Branch on data.found for "not found" — never on error. A missing barcode is a
      // successful response and an ordinary event (SRD §13 offers to create the product).
      // Treating it as an error would turn "new product" into a red banner.
      if (error) {
        logger.error('scan_lookup failed', toLogContext(error))
        throw error
      }

      return data as unknown as ScanLookupResult
    }
  })
}
