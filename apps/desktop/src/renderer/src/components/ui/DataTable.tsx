import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Alert } from './Alert'
import { SpinnerPane } from './Spinner'

export interface Column<Row> {
  /** Stable key. Also the React key for the cell. */
  id: string
  header: string
  /** Cell renderer. Receives the whole row so a cell can combine fields. */
  cell: (row: Row) => ReactNode
  /** Right-align numeric columns so digits line up under `tabular-nums`. */
  align?: 'left' | 'right'
  /** Tailwind width utility, e.g. 'w-32'. Omit to size by content. */
  width?: string
}

interface DataTableProps<Row> {
  columns: Column<Row>[]
  rows: Row[]
  /** Stable identity per row. Never use the array index — it breaks on sort and filter. */
  getRowId: (row: Row) => string
  isLoading?: boolean
  /** Already-safe message from `lib/errors.toUserMessage`. Never a raw Postgres error. */
  error?: string
  onRetry?: () => void
  onRowClick?: (row: Row) => void
  /** Shown when there are zero rows. A blank box is not an empty state. */
  emptyMessage?: string
  caption?: string
}

/**
 * The app's data table.
 *
 * Renders all four states, because three of them are the ones that actually get skipped:
 * loading, error (with Retry), empty, and rows. A table that only handles the happy path
 * shows a blank white box the first time the network hiccups.
 *
 * Rows are capped at 40px (DESIGN.md) to maximise vertical data visibility — this is a
 * dense data tool, and Apple-style restraint applies to chrome and colour, not to the
 * whitespace inside a 500-row table.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  isLoading = false,
  error,
  onRetry,
  onRowClick,
  emptyMessage = 'Nothing to show yet.',
  caption
}: DataTableProps<Row>) {
  if (isLoading) return <SpinnerPane />

  if (error !== undefined) {
    return (
      <div className="p-5">
        <Alert
          tone="error"
          action={
            onRetry ? (
              <button
                className="rounded-full px-3 py-1 text-body-sm font-semibold text-error underline-offset-2 hover:underline"
                onClick={onRetry}
                type="button"
              >
                Retry
              </button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-5">
        <Inbox aria-hidden="true" className="size-8 text-outline" strokeWidth={1.5} />
        <p className="text-body-sm text-on-surface-variant/70">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="bg-on-surface/[0.03]">
            {columns.map((column) => (
              <th
                className={cn(
                  'px-4 py-2.5 text-label-caps uppercase text-on-surface-variant/70',
                  column.align === 'right' ? 'text-right' : 'text-left',
                  column.width
                )}
                key={column.id}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={cn(
                'h-row hairline-b transition-colors',
                // on-surface, not white: a white hover is invisible on the light theme's
                // #f8fafc canvas. DESIGN.md asks for 10% on row hover either way.
                onRowClick && 'cursor-pointer hover:bg-on-surface/10'
              )}
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td
                  className={cn(
                    'px-4 text-table-cell text-on-surface',
                    column.align === 'right' && 'text-right'
                  )}
                  key={column.id}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
