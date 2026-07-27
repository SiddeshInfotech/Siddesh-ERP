import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useDeleteAllInventoryData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (confirmCode: string = 'DELETE-ALL-INVENTORY') => {
      const { error } = await supabase.rpc('delete_all_inventory_data' as any, {
        p_confirm_code: confirmCode
      } as any)
      if (error) {
        throw new Error(error.message || 'Failed to wipe inventory data.')
      }
    },
    onSuccess: () => {
      // Invalidate all queries across the entire React Query cache so UI updates to empty state immediately
      void queryClient.invalidateQueries()
    }
  })
}
