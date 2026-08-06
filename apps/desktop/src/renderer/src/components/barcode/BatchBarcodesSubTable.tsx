import { Activity, AlertCircle } from 'lucide-react'
import { useBatchBarcodes, type BarcodeStatus } from '@/hooks/useBatchBarcodes'
import { cn } from '@/lib/cn'

/**
 * The unit-level barcode list of one batch, shared by the Barcodes registry and the
 * Dashboard batch-activity feed. Each row is one physical unit with its live lifecycle
 * status (generated → in stock → outward), the date/time it reached each stage, and who
 * last changed its status and at which office.
 */

const STATUS_STYLES: Record<BarcodeStatus, string> = {
  GENERATED: 'bg-on-surface/[0.06] text-on-surface-variant',
  IN_STOCK: 'bg-success/10 text-success',
  OUTWARD: 'bg-primary/10 text-primary',
  VOID: 'bg-error/10 text-error',
  AVAILABLE: 'bg-success/10 text-success',
  ALLOCATED: 'bg-warning/10 text-warning-dark',
  INWARDED: 'bg-success/10 text-success',
  OUTWARDED: 'bg-primary/10 text-primary',
  DAMAGED: 'bg-error/10 text-error',
  CANCELLED: 'bg-error/10 text-error'
}

const STATUS_LABEL: Record<BarcodeStatus, string> = {
  GENERATED: 'Generated',
  IN_STOCK: 'In stock',
  OUTWARD: 'Outward',
  VOID: 'Void',
  AVAILABLE: 'Available',
  ALLOCATED: 'Allocated',
  INWARDED: 'In stock',
  OUTWARDED: 'Outward',
  DAMAGED: 'Damaged',
  CANCELLED: 'Cancelled'
}

export function StatusBadge({ status }: { status: BarcodeStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-medium',
        STATUS_STYLES[status] || STATUS_STYLES.GENERATED
      )}
    >
      {STATUS_LABEL[status] || status}
    </span>
  )
}

/** Date + time, or an em dash when the stage has not happened. */
export function formatStamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

interface BatchBarcodesSubTableProps {
  productId: string
  batchCode: string
}

export function BatchBarcodesSubTable({ productId, batchCode }: BatchBarcodesSubTableProps) {
  const { data: barcodes, isLoading, isError, error } = useBatchBarcodes(productId, batchCode)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-on-surface-variant text-body-sm">
        <Activity className="mr-2 size-4 animate-spin text-primary" />
        <span>Loading batch barcodes…</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-4 px-6 text-error text-body-sm flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" />
        <span>Error loading barcodes: {error instanceof Error ? error.message : String(error)}</span>
      </div>
    )
  }

  if (!barcodes || barcodes.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant/70 text-body-sm italic">
        No individual barcode stickers found for this batch.
      </div>
    )
  }

  const inStock = barcodes.filter((b) => b.status === 'IN_STOCK' || b.status === 'INWARDED').length
  const generated = barcodes.filter((b) => b.status === 'GENERATED').length
  const outward = barcodes.filter((b) => b.status === 'OUTWARD' || b.status === 'OUTWARDED').length
  const voided = barcodes.filter((b) => b.status === 'VOID').length

  return (
    <div className="bg-surface rounded-xl border border-border/60 overflow-hidden shadow-sm m-4">
      <div className="bg-surface-variant/30 px-4 py-2.5 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
        <span className="text-label-caps uppercase text-on-surface-variant font-semibold">
          Sticker List ({barcodes.length} total)
        </span>
        <div className="flex items-center gap-3 text-body-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-success"></span> In Stock: {inStock}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-on-surface-variant/40"></span> Generated: {generated}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary"></span> Outward: {outward}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-error"></span> Void: {voided}
          </span>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full border-collapse text-left text-body-sm">
          <thead className="bg-surface sticky top-0 z-10 hairline-b text-label-caps uppercase text-on-surface-variant/70">
            <tr>
              <th className="px-4 py-2 font-semibold w-12 text-center whitespace-nowrap">#</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Barcode Number</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Generated</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Inwarded</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Outwarded</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Scanned By</th>
              <th className="px-4 py-2 font-semibold whitespace-nowrap">Scanned At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {barcodes.map((row, idx) => (
              <tr
                key={row.id || row.code || idx}
                className="hover:bg-on-surface/[0.03] transition-colors"
              >
                <td className="px-4 py-2 text-on-surface-variant/60 font-mono text-xs text-center">
                  {idx + 1}
                </td>
                <td className="px-4 py-2 font-mono font-bold text-on-surface">{row.code}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-2 text-on-surface-variant font-mono text-xs whitespace-nowrap">
                  {formatStamp(row.generated_at)}
                </td>
                <td className="px-4 py-2 text-on-surface-variant font-mono text-xs whitespace-nowrap">
                  {formatStamp(row.inwarded_at)}
                </td>
                <td className="px-4 py-2 text-on-surface-variant font-mono text-xs whitespace-nowrap">
                  {formatStamp(row.outwarded_at)}
                </td>
                <td className="px-4 py-2 text-on-surface whitespace-nowrap">
                  {row.scanned_by_name ?? '—'}
                </td>
                <td className="px-4 py-2 text-on-surface-variant whitespace-nowrap">
                  {row.scanned_office_name ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
