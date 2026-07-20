import { useMemo, useState } from 'react'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useExportReport } from '@/hooks/useExportReport'
import { useCurrentStock, type StockRow } from '@/hooks/useReports'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'
import type { ReportColumn } from '@/lib/reportDocument'

/**
 * Current stock, and the two views of it that matter (SRD §7, §11).
 *
 * DSK-406 current stock, DSK-407 low stock, DSK-408 out of stock. They are one table with a
 * filter rather than three screens: same columns, same export, one place for a bug to live.
 */

type View = 'all' | 'low' | 'out'

const VIEW_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All products', description: 'Everything with a stock record' },
  { value: 'low', label: 'Low stock', description: 'At or below the minimum level' },
  { value: 'out', label: 'Out of stock', description: 'Nothing left' }
]

const TITLES: Record<View, string> = {
  all: 'Current stock report',
  low: 'Low stock report',
  out: 'Out of stock report'
}

/** Shared by the table and the exports, so a file can never disagree with the screen. */
const EXPORT_COLUMNS: ReportColumn<StockRow>[] = [
  { header: 'Barcode', value: (row) => row.skuBarcode },
  { header: 'Product', value: (row) => row.productName },
  { header: 'Category', value: (row) => row.categoryName },
  { header: 'Brand', value: (row) => row.brandName },
  { header: 'Office', value: (row) => row.officeName },
  { header: 'Unit', value: (row) => row.uomCode },
  { header: 'On hand', value: (row) => row.qtyOnHand, align: 'right' },
  { header: 'Reserved', value: (row) => row.qtyReserved, align: 'right' },
  { header: 'Available', value: (row) => row.qtyAvailable, align: 'right' },
  { header: 'Minimum', value: (row) => row.minStock, align: 'right' }
]

export function Stock() {
  const { data, isPending, error, refetch } = useCurrentStock()
  const { exportExcel, exportPdf, isExporting, error: exportError } = useExportReport()
  const [view, setView] = useState<View>('all')

  const rows = useMemo(() => {
    const all = data ?? []
    if (view === 'low') return all.filter((row) => row.isLowStock)
    if (view === 'out') return all.filter((row) => row.qtyAvailable <= 0)
    return all
  }, [data, view])

  const columns: Column<StockRow>[] = [
    {
      id: 'barcode',
      header: 'Barcode',
      width: 'w-32',
      cell: (row) => (
        <span className="font-mono text-mono-id text-on-surface-variant">{row.skuBarcode}</span>
      )
    },
    {
      id: 'product',
      header: 'Product',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{row.productName}</span>
          <span className="text-body-sm text-on-surface-variant/60">
            {row.categoryName ?? '—'}
            {row.officeName === null ? '' : ` · ${row.officeName}`}
          </span>
        </div>
      )
    },
    {
      id: 'onHand',
      header: 'On hand',
      align: 'right',
      width: 'w-24',
      cell: (row) => <span className="tabular-nums text-on-surface-variant">{row.qtyOnHand}</span>
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      width: 'w-24',
      cell: (row) => (
        <span className="tabular-nums text-on-surface-variant/60">{row.qtyReserved}</span>
      )
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <span
          className={cn(
            'font-semibold tabular-nums',
            row.qtyAvailable <= 0
              ? 'text-error'
              : row.isLowStock
                ? 'text-tertiary'
                : 'text-on-surface'
          )}
        >
          {row.qtyAvailable}
          {row.uomCode === null ? null : (
            <span className="ml-1 text-body-sm font-normal text-on-surface-variant/60">
              {row.uomCode}
            </span>
          )}
        </span>
      )
    },
    {
      id: 'min',
      header: 'Minimum',
      align: 'right',
      width: 'w-24',
      // Colour alone never carries meaning — this column states the same fact as a number.
      cell: (row) => <span className="tabular-nums text-on-surface-variant/70">{row.minStock}</span>
    }
  ]

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Stock</h1>
          <p className="text-body-sm text-on-surface-variant/60">
            {isPending ? 'Loading…' : `${rows.length} of ${data?.length ?? 0} records`}
          </p>
        </div>

        <ExportButtons
          columns={EXPORT_COLUMNS}
          isExporting={isExporting}
          meta={{ title: TITLES[view] }}
          onExcel={(r, c, m) => void exportExcel(r, c, m)}
          onPdf={(r, c, m) => void exportPdf(r, c, m)}
          rows={rows}
        />
      </div>

      {exportError === null ? null : <Alert tone="error">{exportError}</Alert>}

      <Card>
        <div className="flex items-end gap-3 hairline-b p-4">
          <Select
            containerClassName="w-64"
            label="Show"
            onChange={(next) => setView(next as View)}
            options={VIEW_OPTIONS}
            value={view}
          />
        </div>

        <DataTable
          caption="Current stock by product"
          columns={columns}
          emptyMessage={
            view === 'low'
              ? 'No products are below their minimum level.'
              : view === 'out'
                ? 'Nothing is out of stock.'
                : 'No stock records yet. Receive stock on the Inward screen.'
          }
          error={error === null ? undefined : toUserMessage(error)}
          getRowId={(row) => `${row.productId}-${row.officeName ?? ''}`}
          isLoading={isPending}
          onRetry={() => void refetch()}
          rows={rows}
        />
      </Card>
    </div>
  )
}
