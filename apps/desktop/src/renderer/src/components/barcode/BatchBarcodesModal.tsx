import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Activity, X } from 'lucide-react'

import { StatusBadge, formatStamp } from '@/components/barcode/BatchBarcodesSubTable'
import { useBatchBarcodes, type BatchBarcodeRow } from '@/hooks/useBatchBarcodes'
import { useBatchOutwardEntries } from '@/hooks/useOutwardHistory'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { DataTable } from '../ui/DataTable'

/**
 * Distinct, theme-safe styles cycled per outward entry, so each entry's units are visually
 * grouped. `row` tints the whole table row; `badge` styles the entry chip; `dot` is the
 * legend swatch. Kept as literal class strings so Tailwind's compiler keeps them.
 */
const ENTRY_STYLES = [
  { row: 'bg-blue-500/[0.07]', badge: 'bg-blue-500/20 text-on-surface', dot: 'bg-blue-500' },
  { row: 'bg-emerald-500/[0.07]', badge: 'bg-emerald-500/20 text-on-surface', dot: 'bg-emerald-500' },
  { row: 'bg-amber-500/[0.08]', badge: 'bg-amber-500/20 text-on-surface', dot: 'bg-amber-500' },
  { row: 'bg-fuchsia-500/[0.07]', badge: 'bg-fuchsia-500/20 text-on-surface', dot: 'bg-fuchsia-500' },
  { row: 'bg-sky-500/[0.07]', badge: 'bg-sky-500/20 text-on-surface', dot: 'bg-sky-500' },
  { row: 'bg-rose-500/[0.07]', badge: 'bg-rose-500/20 text-on-surface', dot: 'bg-rose-500' }
] as const

/** Cycles through the palette by entry index; the modulo keeps it in range. */
const styleFor = (index: number) => ENTRY_STYLES[index % ENTRY_STYLES.length]!


interface BatchBarcodesModalProps {
  productId: string
  productName: string
  batchCode: string
  /** Which side opened this view; drives the title and which columns are shown. */
  scanContext: 'INWARD' | 'OUTWARD'
  /** The inward/outward document this batch belongs to. Kept for callers; the view is read-only. */
  documentId: string
  onClose: () => void
}

/**
 * Batch Records — a READ-ONLY record of a batch's units and their lifecycle.
 *
 * Scanning (inward and outward) now happens on the mobile app, so this modal no longer
 * has a scan-to-receive input; it shows who scanned each unit, when, and at which office.
 * The Inward view drops the Outwarded column (not relevant to receiving); the Outward view
 * keeps it.
 */
export function BatchBarcodesModal({ productId, productName, batchCode, scanContext, onClose }: BatchBarcodesModalProps) {
  const { data: barcodes, isLoading, isError, error } = useBatchBarcodes(productId, batchCode)

  const isInward = scanContext === 'INWARD'

  // Outward entries for this batch (oldest first). Only fetched for the Outward view — the
  // grouping/colouring applies to dispatched units.
  const { data: outwardEntries } = useBatchOutwardEntries(
    isInward ? null : productId,
    isInward ? null : batchCode
  )

  // Assign each dispatched unit to an outward entry, FIFO: units are ordered by when they
  // were outwarded (then by code), and filled into the entries in creation order up to each
  // entry's quantity. The database stores no per-unit → entry link, so this is a consistent
  // presentation, not ground-truth attribution — a unit's colour reflects dispatch order.
  const entryByBarcodeId = useMemo(() => {
    const map = new Map<string, { index: number; outwardNo: string }>()
    if (isInward || !barcodes || !outwardEntries?.length) return map

    const dispatched = barcodes
      .filter((b) => b.status === 'OUTWARD' || b.status === 'OUTWARDED')
      .sort((a, b) => {
        const ta = a.outwarded_at ? Date.parse(a.outwarded_at) : Number.POSITIVE_INFINITY
        const tb = b.outwarded_at ? Date.parse(b.outwarded_at) : Number.POSITIVE_INFINITY
        return ta !== tb ? ta - tb : a.code.localeCompare(b.code)
      })

    let u = 0
    outwardEntries.forEach((entry, index) => {
      for (let k = 0; k < entry.outward_qty && u < dispatched.length; k++, u++) {
        map.set(dispatched[u]!.id, { index, outwardNo: entry.outward_no })
      }
    })
    return map
  }, [isInward, barcodes, outwardEntries])

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

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <Card className="relative z-10 flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 bg-surface px-6 py-4">
          <div>
            <h2 className="text-h2 text-on-surface">{isInward ? 'Inward Batch Records' : 'Outward Batch Records'}</h2>
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
            {/* Receiving progress — the "actual quantity" as units are scanned in on the app. */}
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
            <>
              {!isInward && outwardEntries && outwardEntries.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-outline-variant/20 bg-surface px-4 py-2.5">
                  <span className="text-body-sm text-on-surface-variant/60">Outward entries:</span>
                  {outwardEntries.map((entry, index) => {
                    const style = styleFor(index)
                    return (
                      <span className="inline-flex items-center gap-1.5 text-body-sm" key={entry.id}>
                        <span className={`size-2.5 rounded-full ${style.dot}`} />
                        <span className="font-semibold text-on-surface">{entry.outward_no}</span>
                        <span className="text-on-surface-variant/70">
                          · {entry.outward_qty} pc{entry.outward_qty === 1 ? '' : 's'}
                          {entry.party_name ? ` · ${entry.party_name}` : ''}
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
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
                // Outwarded is only meaningful in the Outward view; hidden for Inward.
                ...(isInward
                  ? []
                  : [
                      {
                        header: 'Outwarded',
                        cell: (row: BatchBarcodeRow) => (
                          <span className="font-mono text-xs">{formatStamp(row.outwarded_at)}</span>
                        )
                      },
                      {
                        header: 'Outward Entry',
                        cell: (row: BatchBarcodeRow) => {
                          const assigned = entryByBarcodeId.get(row.id)
                          if (!assigned) return <span className="text-on-surface-variant/40">—</span>
                          const style = styleFor(assigned.index)
                          return (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                            >
                              {assigned.outwardNo}
                            </span>
                          )
                        }
                      }
                    ]),
                // Scanned By / At show the ACTUAL scanner + office from barcode_scans,
                // never the label's creator. Blank until the unit is really scanned —
                // showing the generator here would misreport who received the stock.
                { header: 'Scanned By', cell: (row) => row.scanned_by_name ?? '—' },
                { header: 'Scanned At', cell: (row) => row.scanned_office_name ?? '—' }
              ]}
              data={barcodes || []}
              emptyMessage="No barcodes generated for this batch."
              rowClassName={(row) => {
                const assigned = entryByBarcodeId.get(row.id)
                return assigned ? styleFor(assigned.index).row : ''
              }}
              />
            </>
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
