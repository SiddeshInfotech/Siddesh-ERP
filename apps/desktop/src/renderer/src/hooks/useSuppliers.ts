import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@siddesh/shared'

export type Supplier = Database['public']['Tables']['suppliers']['Row']

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      if (error) throw error
      return data
    }
  })
}
