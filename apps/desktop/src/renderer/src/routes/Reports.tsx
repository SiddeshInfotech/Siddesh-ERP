import { useState } from 'react'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useExportReport } from '@/hooks/useExportReport'
import { useProducts } from '@/hooks/useProducts'
import {
  useInwardReport,
  useOutwardReport,
  useProductLedger,
  type DateRange,
  type InwardRow,
  type LedgerRow,
  type OutwardRow
} from '@/hooks/useReports'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'
import type { ReportColumn } from '@/lib/reportDocument'

/**
 * Reports — inward, outward and the product ledger (SRD §11; DSK-409 → DSK-414).
 *
 * The current-stock reports live on the Stock screen, since that is what the sidebar calls
 * them; these three are the movement reports.
 */

type Tab = 'inward' | 'outward' | 'ledger'

const TABS: { id: Tab; label: string }[] = [
  { id: 'inward', label: 'Inward' },
  { id: 'outward', label: 'Outward' },
  { id: 'ledger', label: 'Product ledger' }
]

/** Dates render as the storekeeper reads them, not as ISO. */
function formatDate(iso: string): string {
  if (iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN')
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN')
}

const INWARD_EXPORT: ReportColumn<InwardRow>[] = [
  { header: 'Received', value: (row) => formatDateTime(row.receivedAt) },
  { header: 'Inward no', value: (row) => row.inwardNo },
  { header: 'Supplier', value: (row) => row.supplierName },
  { header: 'Barcode', value: (row) => row.skuBarcode },
  { header: 'Product', value: (row) => row.productName },
  { header: 'Qty', value: (row) => row.quantity, align: 'right' },
  { header: 'Invoice no', value: (row) => row.invoiceNo },
  { header: 'Invoice date', value: (row) => (row.invoiceDate === null ? null : formatDate(row.invoiceDate)) },
  { header: 'PO no', value: (row) => row.purchaseOrderNo },
  { header: 'Brought by', value: (row) => row.broughtBy }
]

const OUTWARD_EXPORT: ReportColumn<OutwardRow>[] = [
  { header: 'Issued', value: (row) => formatDateTime(row.issuedAt) },
  { header: 'Outward no', value: (row) => row.outwardNo },
  { header: 'Type', value: (row) => row.outwardType },
  { header: 'Party', value: (row) => row.partyName },
  { header: 'Barcode', value: (row) => row.skuBarcode },
  { header: 'Product', value: (row) => row.productName },
  { header: 'Qty', value: (row) => row.quantity, align: 'right' },
  { header: 'Invoice no', value: (row) => row.invoiceNo },
  { header: 'Sales order', value: (row) => row.salesOrderNo },
  { header: 'Handed over by', value: (row) => row.handedOverBy },
  { header: 'Received by', value: (row) => row.receivedBy }
]

const LEDGER_EXPORT: ReportColumn<LedgerRow>[] = [
  { header: 'Date', value: (row) => formatDateTime(row.occurredAt) },
  { header: 'Type', value: (row) => row.txnType },
  { header: 'Change', value: (row) => row.qtyDelta, align: 'right' },
  { header: 'Balance after', value: (row) => row.balanceAfter, align: 'right' },
  { header: 'Party', value: (row) => row.partyName },
  { header: 'By', value: (row) => row.createdByName },
  { header: 'Notes', value: (row) => row.notes }
]

export function Reports() {
  const [tab, setTab] = useState<Tab>('inward')
  const [range, setRange] = useState<DateRange>({ from: '', to: '' })
  const [productId, setProductId] = useState('')

  const products = useProducts()
  const inward = useInwardReport(range)
  const outward = useOutwardReport(range)
  const ledger = useProductLedger(productId === '' ? null : productId, range)
  const { exportExcel, exportPdf, isExporting, error: exportError } = useExportReport()

  const subtitle =
    range.from === '' && range.to === ''
      ? 'All dates'
      : `${range.from === '' ? 'Start' : formatDate(range.from)} – ${range.to === '' ? 'Today' : formatDate(range.to)}`

  const inwardColumns: Column<InwardRow>[] = [
    { id: 'date', header: 'Received', width: 'w-40', cell: (r) => <span className="text-on-surface-variant">{formatDateTime(r.receivedAt)}</span> },
    { id: 'no', header: 'Inward no', width: 'w-28', cell: (r) => <span className="font-mono text-mono-id text-on-surface-variant">{r.inwardNo}</span> },
    { id: 'supplier', header: 'Supplier', cell: (r) => <span className="text-on-surface">{r.supplierName ?? '—'}</span> },
    {
      id: 'product',
      header: 'Product',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{r.productName}</span>
          <span className="font-mono text-body-sm text-on-surface-variant/60">{r.skuBarcode}</span>
        </div>
      )
    },
    { id: 'qty', header: 'Qty', align: 'right', width: 'w-20', cell: (r) => <span className="font-semibold tabular-nums text-success">+{r.quantity}</span> },
    { id: 'invoice', header: 'Invoice', width: 'w-32', cell: (r) => <span className="text-on-surface-variant">{r.invoiceNo ?? '—'}</span> },
    { id: 'brought', header: 'Brought by', width: 'w-32', cell: (r) => <span className="text-on-surface-variant">{r.broughtBy ?? '—'}</span> }
  ]

  const outwardColumns: Column<OutwardRow>[] = [
    { id: 'date', header: 'Issued', width: 'w-40', cell: (r) => <span className="text-on-surface-variant">{formatDateTime(r.issuedAt)}</span> },
    { id: 'no', header: 'Outward no', width: 'w-28', cell: (r) => <span className="font-mono text-mono-id text-on-surface-variant">{r.outwardNo}</span> },
    { id: 'type', header: 'Type', width: 'w-28', cell: (r) => <span className="text-body-sm text-on-surface-variant">{r.outwardType}</span> },
    { id: 'party', header: 'Party', cell: (r) => <span className="text-on-surface">{r.partyName ?? '—'}</span> },
    {
      id: 'product',
      header: 'Product',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{r.productName}</span>
          <span className="font-mono text-body-sm text-on-surface-variant/60">{r.skuBarcode}</span>
        </div>
      )
    },
    { id: 'qty', header: 'Qty', align: 'right', width: 'w-20', cell: (r) => <span className="font-semibold tabular-nums text-on-surface">−{r.quantity}</span> },
    { id: 'invoice', header: 'Invoice', width: 'w-32', cell: (r) => <span className="text-on-surface-variant">{r.invoiceNo ?? '—'}</span> }
  ]

  const ledgerColumns: Column<LedgerRow>[] = [
    { id: 'date', header: 'Date', width: 'w-40', cell: (r) => <span className="text-on-surface-variant">{formatDateTime(r.occurredAt)}</span> },
    { id: 'type', header: 'Type', width: 'w-32', cell: (r) => <span className="text-body-sm text-on-surface-variant">{r.txnType}</span> },
    {
      id: 'delta',
      header: 'Change',
      align: 'right',
      width: 'w-24',
      cell: (r) => (
        <span className={cn('font-semibold tabular-nums', r.qtyDelta >= 0 ? 'text-success' : 'text-on-surface')}>
          {r.qtyDelta >= 0 ? `+${r.qtyDelta}` : r.qtyDelta}
        </span>
      )
    },
    { id: 'balance', header: 'Balance after', align: 'right', width: 'w-28', cell: (r) => <span className="font-semibold tabular-nums text-on-surface">{r.balanceAfter}</span> },
    { id: 'party', header: 'Party', cell: (r) => <span className="text-on-surface-variant">{r.partyName ?? '—'}</span> },
    { id: 'by', header: 'By', width: 'w-32', cell: (r) => <span className="text-on-surface-variant/70">{r.createdByName ?? '—'}</span> }
  ]

  const active =
    tab === 'inward'
      ? { rows: inward.data ?? [], query: inward, columns: inwardColumns, exportColumns: INWARD_EXPORT, title: 'Inward report' }
      : tab === 'outward'
        ? { rows: outward.data ?? [], query: outward, columns: outwardColumns, exportColumns: OUTWARD_EXPORT, title: 'Outward report' }
        : { rows: ledger.data ?? [], query: ledger, columns: ledgerColumns, exportColumns: LEDGER_EXPORT, title: 'Product ledger' }

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Reports</h1>
          <p className="text-body-sm text-on-surface-variant/60">{subtitle}</p>
        </div>

        {/* Typed per branch rather than through one generic, because each report has its own
            row type and a shared `any` would defeat the point. */}
        {tab === 'inward' ? (
          <ExportButtons columns={INWARD_EXPORT} isExporting={isExporting} meta={{ title: 'Inward report', subtitle }} onExcel={(r, c, m) => void exportExcel(r, c, m)} onPdf={(r, c, m) => void exportPdf(r, c, m)} rows={inward.data ?? []} />
        ) : tab === 'outward' ? (
          <ExportButtons columns={OUTWARD_EXPORT} isExporting={isExporting} meta={{ title: 'Outward report', subtitle }} onExcel={(r, c, m) => void exportExcel(r, c, m)} onPdf={(r, c, m) => void exportPdf(r, c, m)} rows={outward.data ?? []} />
        ) : (
          <ExportButtons columns={LEDGER_EXPORT} isExporting={isExporting} meta={{ title: 'Product ledger', subtitle }} onExcel={(r, c, m) => void exportExcel(r, c, m)} onPdf={(r, c, m) => void exportPdf(r, c, m)} rows={ledger.data ?? []} />
        )}
      </div>

      {exportError === null ? null : <Alert tone="error">{exportError}</Alert>}

      <Card>
        <div className="flex items-center gap-1 hairline-b p-2" role="tablist">
          {TABS.map((entry) => (
            <button
              aria-selected={tab === entry.id}
              className={cn(
                'rounded-lg px-4 py-2 text-body-md font-semibold transition-colors',
                tab === entry.id
                  ? 'bg-primary-container/15 text-primary'
                  : 'text-on-surface-variant hover:bg-on-surface/[0.06] hover:text-on-surface'
              )}
              key={entry.id}
              onClick={() => setTab(entry.id)}
              role="tab"
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-3 hairline-b p-4">
          {/* DSK-412 — from/to on every report. */}
          <DatePicker
            containerClassName="w-44"
            label="From"
            onChange={(next: string) => setRange((r) => ({ ...r, from: next }))}
            value={range.from}
          />
          <DatePicker
            containerClassName="w-44"
            hint="Inclusive."
            label="To"
            onChange={(next: string) => setRange((r) => ({ ...r, to: next }))}
            value={range.to}
          />

          {tab === 'ledger' ? (
            <Select
              containerClassName="flex-1"
              hint="The ledger is one product's full history."
              label="Product"
              onChange={setProductId}
              options={(products.data?.items ?? []).map((item) => ({
                value: item.id,
                label: item.name,
                description: item.skuBarcode
              }))}
              placeholder={products.isPending ? 'Loading…' : 'Choose a product'}
              value={productId}
            />
          ) : null}
        </div>

        {tab === 'ledger' && productId === '' ? (
          <div className="p-5">
            <Alert tone="info">Choose a product to see its full history.</Alert>
          </div>
        ) : tab === 'inward' ? (
          <DataTable caption="Inward report" columns={inwardColumns} emptyMessage="No receipts for this date range." error={inward.error === null ? undefined : toUserMessage(inward.error)} getRowId={(r) => r.id} isLoading={inward.isPending} onRetry={() => void inward.refetch()} rows={inward.data ?? []} />
        ) : tab === 'outward' ? (
          <DataTable caption="Outward report" columns={outwardColumns} emptyMessage="No dispatches for this date range." error={outward.error === null ? undefined : toUserMessage(outward.error)} getRowId={(r) => r.id} isLoading={outward.isPending} onRetry={() => void outward.refetch()} rows={outward.data ?? []} />
        ) : (
          <DataTable caption="Product ledger" columns={ledgerColumns} emptyMessage="No movements for this product in this date range." error={ledger.error === null ? undefined : toUserMessage(ledger.error)} getRowId={(r) => r.id} isLoading={ledger.isPending} onRetry={() => void ledger.refetch()} rows={ledger.data ?? []} />
        )}

        {active.rows.length > 0 ? (
          <div className="hairline-t px-4 py-3">
            <p className="text-body-sm text-on-surface-variant/60">
              {active.rows.length} record{active.rows.length === 1 ? '' : 's'}
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
