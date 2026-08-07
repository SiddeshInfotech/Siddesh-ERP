import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Activity, X } from 'lucide-react'

import { StatusBadge, formatStamp } from '@/components/barcode/BatchBarcodesSubTable'
import { useBatchBarcodes, type BatchBarcodeRow } from '@/hooks/useBatchBarcodes'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { DataTable } from '../ui/DataTable'


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
