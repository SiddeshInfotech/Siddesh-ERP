import { useState } from 'react'
import { Package, ArrowDownToLine, ArrowUpFromLine, FileText, Layers } from 'lucide-react'
import { Button } from './Button'
import { useProductTimeline, useAddProductNote, type TimelineEvent } from '@/hooks/useProductTimeline'
import { Spinner } from './Spinner'

interface TimelineProps {
  productId: string
}

const ICONS = {
  CREATED: Package,
  INWARD: ArrowDownToLine,
  OUTWARD: ArrowUpFromLine,
  NOTE: FileText,
  BATCH: Layers
}

export function Timeline({ productId }: TimelineProps) {
  const [note, setNote] = useState('')
  const { data: events, isPending } = useProductTimeline(productId)
  const addNote = useAddProductNote()

  const formatTime = (d: Date) => 
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d)
    
  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d)

  function handleSaveNote() {
    if (!note.trim()) return
    addNote.mutate(
      { productId, noteText: note.trim() },
      {
        onSuccess: () => setNote('')
      }
    )
  }

  if (isPending) {
    return <div className="py-8 text-center"><Spinner /></div>
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Note Input */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-container-lowest/50 p-2">
        <input
          type="text"
          placeholder="Type a note here to attach it directly to this product's history..."
          className="flex-1 bg-transparent px-4 py-2 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant/50"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveNote()
          }}
        />
        <Button 
          variant="primary" 
          onClick={handleSaveNote}
          disabled={!note.trim() || addNote.isPending}
        >
          {addNote.isPending ? 'Saving...' : '+ Save Note'}
        </Button>
      </div>

      {/* Timeline Events */}
      <div className="relative pl-32 mt-4">
        {/* Vertical Line */}
        <div className="absolute left-[138px] top-4 bottom-0 w-px bg-border -z-10" />

        <div className="flex flex-col gap-10">
          {events?.map((event) => {
            const Icon = ICONS[event.type]
            const date = new Date(event.timestamp)
            const isNote = event.type === 'NOTE'

            return (
              <div key={event.id} className="relative flex gap-6 group">
                {/* Timestamp Left */}
                <div className="absolute -left-32 top-1 text-right w-24">
                  <div className="text-body-sm font-medium text-on-surface-variant">
                    {formatTime(date)}
                  </div>
                </div>

                {/* Date Bubble (if we wanted to group by date, we'd do it here, but we'll show on node for simplicity) */}
                <div className="absolute -left-32 -top-8 w-max">
                  <div className="rounded-full border border-border bg-surface-container px-3 py-1 text-label-md text-on-surface-variant shadow-sm">
                    {formatDate(date)}
                  </div>
                </div>

                {/* Node */}
                <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border bg-surface shadow-sm text-on-surface-variant">
                  <Icon className="size-3.5" />
                </div>

                {/* Content */}
                <div className="flex flex-col gap-2 pb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-h4 text-on-surface">{event.title}</h4>
                  </div>
                  
                  <div className="text-body-sm text-on-surface-variant/70 flex items-center gap-2">
                    <span>{formatDate(date)} {formatTime(date)}</span>
                  </div>

                  {event.details && (
                    <div className={`mt-2 rounded-xl p-4 w-max min-w-[280px] max-w-[600px] shadow-sm border border-border/50 ${isNote ? 'bg-primary-container/10 text-on-surface' : 'bg-surface-container-lowest text-on-surface-variant'}`}>
                      {event.documentRef && (
                        <div className="inline-flex mb-2 items-center rounded bg-surface border px-2 py-0.5 text-label-sm font-mono font-medium text-on-surface-variant">
                          {event.documentRef}
                        </div>
                      )}
                      <p className="text-body-md whitespace-pre-wrap">{event.details}</p>
                    </div>
                  )}

                  <div className="mt-1 text-label-sm text-on-surface-variant/50">
                    by {event.by} • {formatDate(date)} at {formatTime(date)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
