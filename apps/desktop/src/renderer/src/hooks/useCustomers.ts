import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@siddesh/shared'

export type Customer = Database['public']['Tables']['customers']['Row']

/**
 * The saved schools / customers, for the Outward form's "select existing party" picker.
 * Mirrors {@link useSuppliers}. Soft-deleted rows are excluded; sorted by name.
 */
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      if (error) throw error
      return data
    }
  })
}
