import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Inbox,
  PackageX,
  ScanLine,
  TriangleAlert,
  Warehouse
} from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BatchBarcodesSubTable } from '@/components/barcode/BatchBarcodesSubTable'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { SpinnerPane } from '@/components/ui/Spinner'
import { useDashboard } from '@/hooks/useDashboard'
import { useRecentScans, type RecentScanRow } from '@/hooks/useRecentScans'
import { useTodayBatchActivity, type TodayBatchRow } from '@/hooks/useTodayBatchActivity'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'
import { orDash, orDateTime } from '@/lib/movementForm'

/**
 * Dashboard — the home screen (SRD §12; DSK-401 → DSK-405).
 *
 * Every figure is CUMULATIVE across all products and offices (client chat 06/08/2026). The
 * cards summarise system-wide stock and today's movement; the two tables below show which
 * batches moved in and out today, each expandable to its individual units.
 */

const TIME_LABEL = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

interface StatCardProps {
  label: string
  value: number
  unit?: string
  icon: ReactNode
  /** Amber when this number means someone has to act. Never colour for decoration. */
  tone?: 'default' | 'warning'
  hint?: string
  to?: string
  /** Extra content rendered under the hint — e.g. a status breakdown. */
  footer?: ReactNode
  isLoading: boolean
}

function StatCard({ label, value, unit, icon, tone = 'default', hint, to, footer, isLoading }: StatCardProps) {
  const body = (
    <Card
      className={cn(
        'flex h-full flex-col gap-3 p-5 transition-colors',
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
            <span className="ml-1.5 text-body-md font-normal text-on-surface-variant/60">{unit}</span>
          )}
        </p>
      )}

      {hint === undefined ? null : <p className="text-body-sm text-on-surface-variant/60">{hint}</p>}

      {footer}
    </Card>
  )

  return to === undefined ? body : <Link to={to}>{body}</Link>
}

interface TodayBatchTableProps {
  rows: TodayBatchRow[]
  direction: 'INWARD' | 'OUTWARD'
  isLoading: boolean
  expandedKey: string | null
  onToggle: (key: string) => void
}

/**
 * Batches that moved (in or out) today, most-recent first. Each row expands to the batch's
 * unit list. The expand key is prefixed with the direction because one batch can appear in
 * both tables on the same day.
 */
function TodayBatchTable({ rows, direction, isLoading, expandedKey, onToggle }: TodayBatchTableProps) {
  const isInward = direction === 'INWARD'
  const qtyColour = isInward ? 'text-success' : 'text-tertiary'

  if (isLoading) return <SpinnerPane />

  if (rows.length === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
        <Inbox aria-hidden="true" className="size-7 text-outline" strokeWidth={1.5} />
        <p className="text-body-sm text-on-surface-variant/70">
          No {isInward ? 'inward' : 'outward'} activity today.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-on-surface/[0.03]">
            <th className="w-8 px-4 py-2.5" />
            <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">
              Product
            </th>
            <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">
              Batch Code
            </th>
            <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">
              Units today
            </th>
            <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">
              Last activity
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${direction}:${row.batchId}`
            const isExpanded = expandedKey === key
            return (
              <Fragment key={key}>
                <tr
                  className={cn(
                    'hairline-b cursor-pointer transition-colors hover:bg-on-surface/5',
                    isExpanded && 'bg-on-surface/[0.04]'
                  )}
                  onClick={() => onToggle(key)}
                >
                  <td className="px-4 py-2.5 text-on-surface-variant">
                    {isExpanded ? (
                      <ChevronDown aria-hidden="true" className="size-4" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="size-4" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-semibold text-on-surface text-body-sm">{row.productName}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-body-sm font-medium text-on-surface whitespace-nowrap">
                    {row.batchCode}
                  </td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums font-mono font-bold whitespace-nowrap', qtyColour)}>
                    {isInward ? '+' : '−'}
                    {row.unitsToday}
                  </td>
                  <td className="px-4 py-2.5 text-right text-body-sm text-on-surface-variant whitespace-nowrap">
                    {row.lastActivityAt ? TIME_LABEL.format(new Date(row.lastActivityAt)) : '—'}
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="bg-on-surface/[0.02] hairline-b">
                    <td className="p-0" colSpan={5}>
                      <BatchBarcodesSubTable batchCode={row.batchCode} productId={row.productId} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The latest scan events, one row each, showing who scanned, when, and at which office —
 * so a phone's standalone Inward/Outward scan is visible on the desktop within seconds.
 */
function RecentScansTable({ rows, isLoading }: { rows: RecentScanRow[]; isLoading: boolean }) {
  if (isLoading) return <SpinnerPane />

  if (rows.length === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
        <Inbox aria-hidden="true" className="size-7 text-outline" strokeWidth={1.5} />
        <p className="text-body-sm text-on-surface-variant/70">No scans recorded yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-on-surface/[0.03]">
            {['When', 'Product', 'Code', 'Direction', 'Scanned By', 'Scanned At'].map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isInward = row.direction === 'INWARD'
            return (
              <tr key={row.id} className="hairline-b transition-colors hover:bg-on-surface/5">
                <td className="px-4 py-2.5 text-body-sm text-on-surface-variant whitespace-nowrap">
                  {orDateTime(row.scannedAt)}
                </td>
                <td className="px-4 py-2.5 text-body-sm font-semibold text-on-surface whitespace-nowrap">
                  {row.productName}
                </td>
                <td className="px-4 py-2.5 font-mono text-body-sm text-on-surface-variant whitespace-nowrap">
                  {orDash(row.code)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-medium',
                      isInward ? 'bg-success/10 text-success' : 'bg-tertiary/10 text-tertiary'
                    )}
                  >
                    {isInward ? 'Inward' : 'Outward'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-body-sm text-on-surface-variant whitespace-nowrap">
                  {orDash(row.scannedByName)}
                </td>
                <td className="px-4 py-2.5 text-body-sm text-on-surface-variant whitespace-nowrap">
                  {orDash(row.scannedAtOffice)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Dashboard() {
  const { data, isPending, error, refetch } = useDashboard()
  const { data: today, isPending: todayPending } = useTodayBatchActivity()
  const { data: recentScans, isPending: recentPending } = useRecentScans()

  // Which batch row is expanded, keyed by "<direction>:<batchId>" so the two tables don't clash.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const toggle = (key: string) => setExpandedKey((current) => (current === key ? null : key))

  return (
    <div className="flex flex-col gap-10 pb-10">
      <div>
        <h1 className="text-h1 text-on-surface">Dashboard</h1>
        <p className="text-body-sm text-on-surface-variant/60">
          Siddesh Technologies — all products, all offices
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
          footer={
            isPending ? null : (
              // Unit lifecycle breakdown (all products), per client chat.
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-body-sm">
                <span className="inline-flex items-center gap-1 text-success">
                  <span className="size-1.5 rounded-full bg-success" /> In stock {data?.unitsInStock ?? 0}
                </span>
                <span className="inline-flex items-center gap-1 text-on-surface-variant/70">
                  <span className="size-1.5 rounded-full bg-on-surface-variant/50" /> Generated{' '}
                  {data?.unitsGenerated ?? 0}
                </span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <span className="size-1.5 rounded-full bg-primary" /> Outward {data?.unitsOutward ?? 0}
                </span>
              </div>
            )
          }
          hint={`Across ${data?.productsTracked ?? 0} products`}
          icon={<Warehouse aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          isLoading={isPending}
          label="Current stock"
          to="/stock"
          unit="units"
          value={data?.totalOnHand ?? 0}
        />

        <StatCard
          hint="Received today (all products)"
          icon={<ArrowDownToLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          isLoading={isPending}
          label="Today's inward"
          unit="units"
          value={data?.todayInward ?? 0}
        />

        <StatCard
          hint="Given out today (all products)"
          icon={<ArrowUpFromLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          isLoading={isPending}
          label="Today's outward"
          unit="units"
          value={data?.todayOutward ?? 0}
        />

        <StatCard
          hint="At or below minimum level"
          icon={<TriangleAlert aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          isLoading={isPending}
          label="Low stock"
          to="/stock"
          tone="warning"
          value={data?.lowStockCount ?? 0}
        />
      </div>

      {/* Out of stock earns a place only when it is true. */}
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
            {data?.outOfStockCount} product{data?.outOfStockCount === 1 ? ' has' : 's have'} no stock left.
          </span>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ArrowDownToLine aria-hidden="true" className="size-4 text-success" strokeWidth={1.5} />
            <h2 className="text-h3 text-on-surface">Today's Inward — Batch Activity</h2>
          </div>
          <Card className="overflow-hidden">
            <TodayBatchTable
              direction="INWARD"
              expandedKey={expandedKey}
              isLoading={todayPending}
              onToggle={toggle}
              rows={today?.inward ?? []}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ArrowUpFromLine aria-hidden="true" className="size-4 text-tertiary" strokeWidth={1.5} />
            <h2 className="text-h3 text-on-surface">Today's Outward — Batch Activity</h2>
          </div>
          <Card className="overflow-hidden">
            <TodayBatchTable
              direction="OUTWARD"
              expandedKey={expandedKey}
              isLoading={todayPending}
              onToggle={toggle}
              rows={today?.outward ?? []}
            />
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ScanLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          <h2 className="text-h3 text-on-surface">Recent Scan Activity</h2>
        </div>
        <Card className="overflow-hidden">
          <RecentScansTable rows={recentScans ?? []} isLoading={recentPending} />
        </Card>
      </div>
    </div>
  )
}
