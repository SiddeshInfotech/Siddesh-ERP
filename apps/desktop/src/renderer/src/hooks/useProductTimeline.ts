import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'

export type TimelineEventType = 'CREATED' | 'INWARD' | 'OUTWARD' | 'NOTE' | 'BATCH'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  title: string
  timestamp: string
  by: string
  details?: string
  documentRef?: string
}

export function useProductTimeline(productId: string) {
  return useQuery({
    queryKey: ['product_timeline', productId],
    queryFn: async (): Promise<TimelineEvent[]> => {
      // 1. Fetch Product Creation
      const { data: prodData } = await supabase
        .from('products')
        .select('created_at, created_by, profiles!products_created_by_fkey(full_name)')
        .eq('id', productId)
        .single()

      // 2. Fetch Batches
      const { data: batchesData } = await supabase
        .from('product_batches')
        .select('id, code, created_at, created_by, profiles!product_batches_created_by_fkey(full_name)')
        .eq('product_id', productId)

      // 3. Fetch Inwards
      const { data: inwardsData } = await supabase
        .from('inward_items')
        .select('id, quantity, created_at, created_by, inwards!inner(inward_no, profiles!inwards_created_by_fkey(full_name))')
        .eq('product_id', productId)

      // 4. Fetch Outwards
      const { data: outwardsData } = await supabase
        .from('outward_items')
        .select('id, quantity, created_at, created_by, outwards!inner(outward_no, profiles!outwards_created_by_fkey(full_name))')
        .eq('product_id', productId)

      // 5. Fetch Notes
      const { data: notesData } = await supabase
        .from('product_notes')
        .select('id, note_text, created_at, created_by, profiles!product_notes_created_by_fkey(full_name)')
        .eq('product_id', productId)

      const events: TimelineEvent[] = []

      if (prodData) {
        events.push({
          id: `prod-${productId}`,
          type: 'CREATED',
          title: 'Product Created',
          timestamp: prodData.created_at,
          by: (prodData.profiles as any)?.full_name ?? 'System User'
        })
      }

      for (const b of batchesData ?? []) {
        events.push({
          id: `batch-${b.id}`,
          type: 'BATCH',
          title: 'Batch Created',
          timestamp: b.created_at,
          by: (b.profiles as any)?.full_name ?? 'System User',
          details: `Batch Code: ${b.code}`
        })
      }

      for (const i of inwardsData ?? []) {
        events.push({
          id: `inward-${i.id}`,
          type: 'INWARD',
          title: 'Inward Entry',
          timestamp: i.created_at,
          by: (i.inwards as any)?.profiles?.full_name ?? 'System User',
          details: `Received ${i.quantity} units`,
          documentRef: (i.inwards as any)?.inward_no
        })
      }

      for (const o of outwardsData ?? []) {
        events.push({
          id: `outward-${o.id}`,
          type: 'OUTWARD',
          title: 'Outward Entry',
          timestamp: o.created_at,
          by: (o.outwards as any)?.profiles?.full_name ?? 'System User',
          details: `Dispatched ${o.quantity} units`,
          documentRef: (o.outwards as any)?.outward_no
        })
      }

      for (const n of notesData ?? []) {
        events.push({
          id: `note-${n.id}`,
          type: 'NOTE',
          title: 'Note Added',
          timestamp: n.created_at,
          by: (n.profiles as any)?.full_name ?? 'System User',
          details: n.note_text
        })
      }

      // Sort descending (newest first)
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      return events
    }
  })
}

export function useAddProductNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ productId, noteText }: { productId: string; noteText: string }) => {
      const { error } = await supabase
        .from('product_notes')
        .insert({ product_id: productId, note_text: noteText })

      if (error) throw new Error(toUserMessage(error))
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product_timeline', productId] })
    }
  })
}
