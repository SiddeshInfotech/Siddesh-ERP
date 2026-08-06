import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Activity, ScanLine, X } from 'lucide-react'

import { StatusBadge, formatStamp } from '@/components/barcode/BatchBarcodesSubTable'
import { cn } from '@/lib/cn'
import { useBatchBarcodes, type BatchBarcodeRow } from '@/hooks/useBatchBarcodes'
import { useScanReceive } from '@/hooks/useScanReceive'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { DataTable } from '../ui/DataTable'


interface BatchBarcodesModalProps {
  productId: string
  productName: string
  batchCode: string
  onClose: () => void
}

type ScanFeedback =
  | { kind: 'received'; code: string }
  | { kind: 'already'; code: string }
  | { kind: 'notfound'; code: string }
  | { kind: 'error'; message: string }
  | null

export function BatchBarcodesModal({ productId, productName, batchCode, onClose }: BatchBarcodesModalProps) {
  const { data: barcodes, isLoading, isError, error } = useBatchBarcodes(productId, batchCode)
  const scanReceive = useScanReceive()

  const [scanValue, setScanValue] = useState('')
  const [feedback, setFeedback] = useState<ScanFeedback>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Keyboard-wedge detection: a USB/Bluetooth scanner types the whole code in a
  // sub-100ms burst, a human does not. We time from the first keystroke to Enter.
  const firstKeyAt = useRef<number | null>(null)

  // Keep the scanner input focused — receiving is a scan-scan-scan loop, not a click loop.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const received = useMemo(
    () => (barcodes ?? []).filter((b) => b.status !== 'GENERATED' && b.status !== 'VOID').length,
    [barcodes]
  )
  const inStock = useMemo(
    () => (barcodes ?? []).filter((b) => b.status === 'IN_STOCK' || b.status === 'INWARDED').length,
    [barcodes]
  )
  const generated = useMemo(
    () => (barcodes ?? []).filter((b) => b.status === 'GENERATED').length,
    [barcodes]
  )
  const outward = useMemo(
    () => (barcodes ?? []).filter((b) => b.status === 'OUTWARD' || b.status === 'OUTWARDED').length,
    [barcodes]
  )
  const voided = useMemo(
    () => (barcodes ?? []).filter((b) => b.status === 'VOID').length,
    [barcodes]
  )
  const total = barcodes?.length ?? 0
  const pending = total - received

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      if (firstKeyAt.current === null) firstKeyAt.current = performance.now()
      return
    }
    event.preventDefault()
    const code = scanValue.trim()
    const elapsed = firstKeyAt.current !== null ? performance.now() - firstKeyAt.current : Infinity
    firstKeyAt.current = null
    setScanValue('')
    if (code.length === 0) return

    // Fast burst → a real scanner. Slow typing → manual keyboard entry.
    const deviceSource = code.length >= 4 && elapsed < 100 ? 'USB' : 'MANUAL'

    scanReceive.mutate(
      { code, deviceSource },
      {
        onSuccess: (result) => {
          if (result.found === false) setFeedback({ kind: 'notfound', code })
          else if (result.already) setFeedback({ kind: 'already', code })
          else setFeedback({ kind: 'received', code })
        },
        onError: (err) =>
          setFeedback({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    )
    inputRef.current?.focus()
  }

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <Card className="relative z-10 flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 bg-surface px-6 py-4">
          <div>
            <h2 className="text-h2 text-on-surface">Batch Records</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant/70">
              {productName} · Batch <span className="font-semibold text-primary">{batchCode}</span>
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-4 border-r border-outline-variant/30 pr-6 text-right">
              <div>
                <p className="text-h2 tabular-nums text-success">{inStock}</p>
                <p className="text-body-sm text-on-surface-variant/60">In stock</p>
              </div>
              <div>
                <p className="text-h2 tabular-nums text-on-surface-variant/80">{generated}</p>
                <p className="text-body-sm text-on-surface-variant/60">Generated</p>
              </div>
              <div>
                <p className="text-h2 tabular-nums text-primary">{outward}</p>
                <p className="text-body-sm text-on-surface-variant/60">Outward</p>
              </div>
              <div>
                <p className="text-h2 tabular-nums text-error/80">{voided}</p>
                <p className="text-body-sm text-on-surface-variant/60">Void</p>
              </div>
            </div>
            {/* Live receiving progress — the "actual quantity" as it is scanned in. */}
            <div className="text-right">
              <p className="text-h2 tabular-nums text-success">
                {received}
                <span className="text-body-md text-on-surface-variant/60"> / {total}</span>
              </p>
              <p className="text-body-sm text-on-surface-variant/60">
                {pending > 0 ? `${pending} pending scan` : 'All received'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-variant/50"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scan-to-receive */}
        <div className="border-b border-outline-variant/30 bg-surface-variant/10 px-6 py-3">
          <div className="flex items-center gap-3">
            <ScanLine className="size-5 shrink-0 text-on-surface-variant" strokeWidth={1.5} />
            <input
              ref={inputRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scan or type a barcode to mark it received, then press Enter"
              aria-label="Scan barcode to receive"
              autoComplete="off"
              spellCheck={false}
              className="h-10 flex-1 rounded-full border border-outline-variant/40 bg-surface px-4 text-body-md text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {scanReceive.isPending ? <Activity className="size-4 animate-spin text-on-surface-variant" /> : null}
          </div>
          {feedback ? (
            <p
              className={cn(
                'mt-2 pl-8 text-body-sm',
                feedback.kind === 'received' && 'text-success',
                feedback.kind === 'already' && 'text-on-surface-variant',
                (feedback.kind === 'notfound' || feedback.kind === 'error') && 'text-error'
              )}
            >
              {feedback.kind === 'received' && `Received ${feedback.code}.`}
              {feedback.kind === 'already' && `${feedback.code} was already received.`}
              {feedback.kind === 'notfound' && `${feedback.code} is not a barcode in this system.`}
              {feedback.kind === 'error' && `Could not record scan. ${feedback.message}`}
            </p>
          ) : null}
        </div>

        {/* Records */}
        <div className="flex-1 overflow-y-auto bg-surface-variant/5 p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-on-surface-variant">
              <Activity className="mr-3 size-6 animate-spin" />
              <span>Loading tracking records…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-error">
              <p className="font-bold">Error loading records</p>
              <p className="font-mono text-sm">{error?.message || String(error)}</p>
            </div>
          ) : (
            <DataTable<BatchBarcodeRow>
              columns={[
                { header: 'Barcode Number', cell: (row) => <span className="font-mono">{row.code}</span> },
                { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
                {
                  header: 'Generated',
                  cell: (row) => (
                    <span className="font-mono text-xs">{formatStamp(row.generated_at)}</span>
                  )
                },
                {
                  header: 'Inwarded',
                  cell: (row) => (
                    <span className="font-mono text-xs">{formatStamp(row.inwarded_at)}</span>
                  )
                },
                {
                  header: 'Outwarded',
                  cell: (row) => (
                    <span className="font-mono text-xs">{formatStamp(row.outwarded_at)}</span>
                  )
                },
                { header: 'Scanned By', cell: (row) => row.scanned_by_name ?? row.generated_by_name ?? '—' },
                { header: 'Scanned At', cell: (row) => row.scanned_office_name ?? (row.status === 'GENERATED' ? 'System' : '—') }
              ]}
              data={barcodes || []}
              emptyMessage="No barcodes generated for this batch."
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-outline-variant/30 bg-surface px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  )

  return createPortal(content, document.body)
}
