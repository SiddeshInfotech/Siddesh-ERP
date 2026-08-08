import { useState } from 'react'
import {
  AlertTriangle,
  Database,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  Settings as SettingsIcon,
  Server,
  Building2,
  UserCheck,
  RefreshCw
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OfficeManagement } from '@/components/settings/OfficeManagement'
import { UserManagement } from '@/components/settings/UserManagement'
import { useAuth } from '@/hooks/useAuth'
import { useConfirm } from '@/hooks/useConfirm'
import { useAlert } from '@/hooks/useAlert'
import { useProfile } from '@/hooks/useProfile'
import { useDeleteAllInventoryData } from '@/hooks/useSystemMutations'
import { cn } from '@/lib/cn'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  STORE_MANAGER: 'Store Manager',
  SALES_EXECUTIVE: 'Sales Executive'
}

export function Settings() {
  const { session, user } = useAuth()
  const { profile, isAdmin } = useProfile()
  const confirm = useConfirm()
  const showAlert = useAlert()
  const wipeMutation = useDeleteAllInventoryData()

  // The wipe is scoped to the login (migration 62): Admin resets every office, a Store
  // Manager resets only their own. Any other role cannot run it.
  const canWipe = isAdmin || profile?.role === 'STORE_MANAGER'
  const officeLabel = profile?.officeName ?? 'your office'

  const handleDeleteAllData = async () => {
    const ok = await confirm({
      title: isAdmin ? 'Wipe Inventory — All Offices' : `Wipe Inventory — ${officeLabel}`,
      description: isAdmin
        ? 'Are you absolutely sure you want to delete ALL inventory data for EVERY office?\n\nEvery product, barcode, batch, category, supplier, customer, and stock movement record across all offices will be permanently deleted, and all sequence counters reset to 0.\n\nThis action CANNOT be undone.'
        : `Are you absolutely sure you want to delete all inventory data for ${officeLabel}?\n\nEvery product, barcode, batch, category, supplier, customer, and stock movement record for this office will be permanently deleted. Other offices are not affected.\n\nThis action CANNOT be undone.`,
      confirmText: isAdmin ? 'Wipe All Offices' : 'Wipe This Office',
      tone: 'error',
      requireCode: '123Del'
    })

    if (!ok) return

    try {
      await wipeMutation.mutateAsync('DELETE-ALL-INVENTORY')
      void showAlert({
        title: 'System Reset Successful',
        description: isAdmin
          ? 'All inventory data across every office has been permanently wiped, and sequences reset to zero.\n\nProfiles and office settings remain untouched.'
          : `All inventory data for ${officeLabel} has been permanently wiped. Other offices are untouched.\n\nYour profile and office settings remain untouched.`,
        tone: 'success'
      })
    } catch (err: any) {
      const msg = err?.message || 'Failed to wipe inventory data.'
      void showAlert({
        title: 'Reset Failed',
        description: msg,
        tone: 'error'
      })
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-xs">
            <SettingsIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-h1 text-on-surface">System Settings & Data Management</h1>
            <p className="text-body-sm text-on-surface-variant/70">
              Manage database maintenance, admin controls, and ERP configuration
            </p>
          </div>
        </div>
      </div>

      {/* System Status Card */}
      <Card className="p-6 border-border/80 bg-surface/90 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-2 text-on-surface font-bold text-h3 mb-4">
          <Server className="size-5 text-primary" />
          <span>Current Session & Environment</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/60 bg-surface-variant/20 p-4">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-on-surface-variant mb-1">
              <UserCheck className="size-4 text-primary" />
              <span>Logged in User</span>
            </div>
            <div className="text-body-md font-bold text-on-surface truncate">
              {user?.email || session?.user?.email || 'Administrator'}
            </div>
            <div className="text-caption font-mono text-on-surface-variant/80 mt-0.5">
              Role: {profile ? (ROLE_LABELS[profile.role] ?? profile.role) : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-variant/20 p-4">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-on-surface-variant mb-1">
              <Building2 className="size-4 text-primary" />
              <span>Active Office Location</span>
            </div>
            <div className="text-body-md font-bold text-on-surface truncate">
              {isAdmin ? 'All Offices' : (profile?.officeName ?? '—')}
            </div>
            <div className="text-caption font-mono text-on-surface-variant/80 mt-0.5">
              Code: {isAdmin ? 'ADMIN' : (profile?.officeCode ?? '—')}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-variant/20 p-4">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-on-surface-variant mb-1">
              <Database className="size-4 text-primary" />
              <span>Database Engine</span>
            </div>
            <div className="text-body-md font-bold text-on-surface">
              PostgreSQL (Supabase Cloud)
            </div>
            <div className="text-caption font-mono text-success flex items-center gap-1 mt-0.5 font-medium">
              <span className="size-1.5 rounded-full bg-success inline-block animate-pulse" />
              Connected & Synchronized
            </div>
          </div>
        </div>
      </Card>

      {/* Admin-only: Office & User Management. RLS still gates every write, so this is a
          UI convenience, not the security boundary. */}
      {isAdmin ? (
        <>
          <OfficeManagement />
          <UserManagement />
        </>
      ) : null}

      {/* Danger Zone Card */}
      <Card className="border-error/50 bg-error/5 p-6 relative overflow-hidden shadow-md">
        <div className="absolute top-0 right-0 w-64 h-64 bg-error/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 text-error font-extrabold text-h3 pb-3 border-b border-error/20">
            <ShieldAlert className="size-6 shrink-0 animate-bounce" />
            <span>Danger Zone — Inventory Data Wipe</span>
          </div>

          <div className="mt-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h4 className="text-body-lg font-bold text-on-surface">
                Reset Inventory System — {isAdmin ? 'All Offices' : officeLabel}
              </h4>
              <p className="mt-1 text-body-md text-on-surface-variant leading-relaxed">
                Permanently delete all inventory data for{' '}
                <strong>{isAdmin ? 'every office' : officeLabel}</strong>. This includes all <strong>products, categories, brands, UOMs, barcode batches, individual barcode stickers, stock movements (inwards & outwards), transfer notes, suppliers, customers, and accounting ledger entries</strong>.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-error/15 px-3 py-2 text-body-sm font-bold text-error border border-error/20">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  {isAdmin
                    ? 'Not a single character will remain in any office. All sequences reset to 0.'
                    : `Only ${officeLabel}'s inventory is cleared — other offices are untouched.`}
                </span>
              </div>
              {!canWipe ? (
                <p className="mt-3 text-body-sm text-on-surface-variant/70">
                  Only an Admin (all offices) or a Store Manager (their own office) can reset inventory.
                </p>
              ) : null}
            </div>

            <div className="shrink-0 w-full lg:w-auto flex justify-end">
              <Button
                variant="primary"
                className="w-full lg:w-auto bg-error hover:bg-error/90 text-white font-bold px-6 py-3 rounded-full shadow-lg shadow-error/25 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleDeleteAllData}
                disabled={wipeMutation.isPending || !canWipe}
              >
                {wipeMutation.isPending ? (
                  <RefreshCw className="size-5 animate-spin" />
                ) : (
                  <Trash2 className="size-5" />
                )}
                <span>{isAdmin ? 'Delete All Offices’ Data' : 'Delete This Office’s Data'}</span>
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
