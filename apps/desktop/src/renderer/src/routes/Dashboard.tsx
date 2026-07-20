import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageX,
  TriangleAlert,
  Warehouse
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { useDashboard } from '@/hooks/useDashboard'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

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

  return (
    <div className="flex flex-col gap-gutter">
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
    </div>
  )
}
