import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface BarcodeTimelineEvent {
  id: string
  action: 'GENERATED' | 'RECEIVE' | 'ISSUE' | 'VOID'
  timestamp: string
  byName: string
  officeName?: string
  deviceSource?: string
}

export function useBarcodeTimeline(barcodeId: string | null) {
  return useQuery({
    queryKey: ['barcode_timeline', barcodeId],
    queryFn: async (): Promise<BarcodeTimelineEvent[]> => {
      if (!barcodeId) return []

      // 1. Fetch Barcode Details (Generated event)
      const { data: barcode, error: bcError } = await supabase
        .from('product_barcodes')
        .select(`
          created_at,
          profiles:created_by!product_barcodes_created_by_fkey (full_name)
        `)
        .eq('id', barcodeId)
        .single()

      if (bcError) throw bcError

      // 2. Fetch Barcode Scans
      const { data: scans, error: scansError } = await supabase
        .from('barcode_scans')
        .select(`
          id,
          action,
          scanned_at,
          device_source,
          profiles:scanned_by!barcode_scans_scanned_by_fkey (full_name),
          offices:office_id!barcode_scans_office_id_fkey (name)
        `)
        .eq('barcode_id', barcodeId)
        .order('scanned_at', { ascending: true })

      if (scansError) throw scansError

      const events: BarcodeTimelineEvent[] = []

      // Add "GENERATED" event
      if (barcode) {
        events.push({
          id: `gen-${barcodeId}`,
          action: 'GENERATED',
          timestamp: barcode.created_at,
          byName: (barcode.profiles as any)?.full_name || 'System User'
        })
      }

      // Add scan events
      if (scans) {
        scans.forEach((s) => {
          events.push({
            id: s.id,
            action: s.action as any,
            timestamp: s.scanned_at,
            byName: (s.profiles as any)?.full_name || 'System User',
            officeName: (s.offices as any)?.name || 'Unknown Office',
            deviceSource: s.device_source || undefined
          })
        })
      }

      // Sort all events by timestamp ascending
      return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    },
    enabled: !!barcodeId
  })
}
