import { CheckCircle2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { toUserMessage } from '@/lib/errors'
import { useConnectionCheck } from '@/hooks/useConnectionCheck'

/**
 * Dashboard.
 *
 * Day 1 scope is the connection state only. The stat cards, Recent Activity and Low Stock
 * Alert from the Stitch mock (dashboard_dark) need the ledger, which lands Day 3 — showing
 * them now with invented numbers would be worse than showing nothing.
 */
export function Dashboard() {
  const { data: officeCount, isPending, error, refetch } = useConnectionCheck()

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <h1 className="text-h1 text-on-surface">Dashboard</h1>
        <p className="text-body-sm text-on-surface-variant/60">
          Siddesh Technologies — Pune · Nashik · Mumbai
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-h2 text-on-surface">Database connection</h2>

        {isPending ? (
          <div className="flex items-center gap-3">
            <Spinner size="sm" label={null} />
            <span className="text-body-md text-on-surface-variant">Checking…</span>
          </div>
        ) : error ? (
          <Alert
            tone="error"
            action={
              <button
                className="rounded-full px-3 py-1 text-body-sm font-semibold text-error underline-offset-2 hover:underline"
                onClick={() => void refetch()}
                type="button"
              >
                Retry
              </button>
            }
          >
            {toUserMessage(error)}
          </Alert>
        ) : (
          <Alert tone="success">
            Connected — {officeCount} {officeCount === 1 ? 'office' : 'offices'} found.
          </Alert>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant/70">
          <CheckCircle2 aria-hidden="true" className="size-[18px] text-success" strokeWidth={1.5} />
          Shell, design system and sign-in are in place. Products land next.
        </div>
      </Card>
    </div>
  )
}
