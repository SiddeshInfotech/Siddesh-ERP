import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageX,
  TriangleAlert,
  Warehouse,
  Trash2
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { useDashboard } from '@/hooks/useDashboard'
import { useRecentTransactions, type LedgerRow } from '@/hooks/useReports'
import { useDeleteLedgerEntry } from '@/hooks/useSaveMovement'
import { useConfirm } from '@/hooks/useConfirm'
import { useAlert } from '@/hooks/useAlert'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
})

/**
 * Dashboard — the home screen (SRD §12; DSK-401 → DSK-405).
 *
 * SRD §12 also lists "Pending Orders", explicitly marked future. There is no purchase-order
 * table, so it is absent rather than shown as 0 — a card reading 0 asserts "none pending",
 * which we cannot know.
 */

interface StatCardProps {
  label: string
  value: number
  unit?: string
  icon: ReactNode
  /** Amber when this number means someone has to act. Never colour for decoration. */
  tone?: 'default' | 'warning'
  hint?: string
  to?: string
  isLoading: boolean
}

function StatCard({ label, value, unit, icon, tone = 'default', hint, to, isLoading }: StatCardProps) {
  const body = (
    <Card
      className={cn(
        'flex flex-col gap-3 p-5 transition-colors',
        to !== undefined && 'hover:bg-on-surface/[0.04]'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
        {icon}
      </div>

      {isLoading ? (
        // A skeleton the same height as the real figure — DESIGN.md: no layout shift on load.
        <div className="h-9 w-20 animate-pulse rounded bg-on-surface/10" />
      ) : (
        <p
          className={cn(
            'text-[32px] font-semibold leading-none tabular-nums',
            tone === 'warning' && value > 0 ? 'text-tertiary' : 'text-on-surface'
          )}
        >
          {value}
          {unit === undefined ? null : (
            <span className="ml-1.5 text-body-md font-normal text-on-surface-variant/60">
              {unit}
            </span>
          )}
        </p>
      )}

      {hint === undefined ? null : (
        <p className="text-body-sm text-on-surface-variant/60">{hint}</p>
      )}
    </Card>
  )

  return to === undefined ? body : <Link to={to}>{body}</Link>
}

export function Dashboard() {
  const { data, isPending, error, refetch } = useDashboard()
  const { data: recentTransactions, isLoading: transactionsLoading } = useRecentTransactions(10)
  const deleteLedgerEntry = useDeleteLedgerEntry()
  const confirm = useConfirm()
  const showAlert = useAlert()

  async function handleDelete(row: LedgerRow) {
    const ok = await confirm({
      title: 'Delete Transaction',
      description: `Are you sure you want to delete ledger entry of ${row.qtyDelta >= 0 ? '+' : ''}${row.qtyDelta} for ${row.productName}?`,
      confirmText: 'Delete Transaction'
    })
    if (!ok) return
    try {
      await deleteLedgerEntry.mutateAsync(row.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete ledger entry.'
      void showAlert({
        title: msg.includes('Cannot delete') ? 'Cannot Delete Item' : 'Action Failed',
        description: msg,
        tone: 'warning'
      })
    }
  }

  return (
    <div className="flex flex-col gap-10 pb-10">
      <div>
        <h1 className="text-h1 text-on-surface">Dashboard</h1>
        <p className="text-body-sm text-on-surface-variant/60">
          Siddesh Technologies — Pune · Nashik · Mumbai
        </p>
      </div>

      {error !== null ? (
        <Alert
          action={
            <button
              className="rounded-full px-3 py-1 text-body-sm font-semibold text-error underline-offset-2 hover:underline"
              onClick={() => void refetch()}
              type="button"
            >
              Retry
            </button>
          }
          tone="error"
        >
          {toUserMessage(error)}
        </Alert>
      ) : null}

      <div className="grid grid-cols-4 gap-gutter">
        <StatCard
          hint={`Across ${data?.productsTracked ?? 0} products`}
          icon={<Warehouse aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          isLoading={isPending}
          label="Current stock"
          to="/stock"
          unit="units"
          value={data?.totalOnHand ?? 0}
        />

        <StatCard
          hint="Received today"
          icon={
            <ArrowDownToLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          isLoading={isPending}
          label="Today's inward"
          to="/reports"
          unit="units"
          value={data?.todayInward ?? 0}
        />

        <StatCard
          hint="Given out today"
          icon={
            <ArrowUpFromLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          isLoading={isPending}
          label="Today's outward"
          to="/reports"
          unit="units"
          value={data?.todayOutward ?? 0}
        />

        <StatCard
          hint="At or below minimum level"
          icon={
            <TriangleAlert aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          isLoading={isPending}
          label="Low stock"
          to="/stock"
          tone="warning"
          value={data?.lowStockCount ?? 0}
        />
      </div>

      {/* Out of stock earns a place only when it is true. An always-present card reading 0 is
          noise; a line that appears when something is actually wrong gets read. */}
      {!isPending && (data?.outOfStockCount ?? 0) > 0 ? (
        <Alert
          action={
            <Link
              className="whitespace-nowrap rounded-full px-3 py-1 text-body-sm font-semibold text-tertiary underline-offset-2 hover:underline"
              to="/stock"
            >
              View stock
            </Link>
          }
          tone="warning"
        >
          <span className="flex items-center gap-2">
            <PackageX aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {data?.outOfStockCount} product{data?.outOfStockCount === 1 ? ' has' : 's have'} no
            stock left.
          </span>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-on-surface">Recent Transactions</h2>
          <Link to="/reports" className="text-body-sm font-semibold text-primary hover:underline">
            View all reports &rarr;
          </Link>
        </div>
        <Card className="overflow-hidden">
          {transactionsLoading ? (
            <div className="p-8 text-center text-on-surface-variant">Loading transactions...</div>
          ) : (
            <DataTable<LedgerRow>
              columns={[
                {
                  accessorKey: 'date',
                  header: 'Date',
                  cell: (row) => DATE_FORMATTER.format(new Date(row.occurredAt))
                },
                {
                  accessorKey: 'product',
                  header: 'Product',
                  cell: (row) => row.productName
                },
                {
                  accessorKey: 'type',
                  header: 'Type',
                  cell: (row) => (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                        row.txnType === 'INWARD'
                          ? 'bg-success/10 text-success'
                          : row.txnType === 'OUTWARD'
                            ? 'bg-tertiary/10 text-tertiary'
                            : 'bg-on-surface/10 text-on-surface-variant'
                      )}
                    >
                      {row.txnType}
                    </span>
                  )
                },
                {
                  accessorKey: 'qty',
                  header: 'Qty',
                  cell: (row) => (
                    <span
                      className={cn(
                        'tabular-nums font-medium',
                        row.qtyDelta > 0 ? 'text-success' : row.qtyDelta < 0 ? 'text-tertiary' : ''
                      )}
                    >
                      {row.qtyDelta > 0 ? '+' : ''}
                      {row.qtyDelta}
                    </span>
                  )
                },
                {
                  accessorKey: 'party',
                  header: 'Party',
                  cell: (row) => (
                    <span className="text-on-surface-variant">
                      {row.partyName || '—'}
                    </span>
                  )
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  align: 'right',
                  width: 'w-20',
                  cell: (row) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDelete(row)
                      }}
                      disabled={deleteLedgerEntry.isPending}
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                      title="Delete transaction"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  )
                }
              ]}
              data={recentTransactions ?? []}
              emptyMessage="No recent transactions found."
            />
          )}
        </Card>
      </div>
    </div>
  )
}
