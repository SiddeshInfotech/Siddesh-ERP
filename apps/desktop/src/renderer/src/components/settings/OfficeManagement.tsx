import { useMemo, useState } from 'react'
import { Building2, Info, KeyRound, Pencil, Plus, Power, PowerOff } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field } from '@/components/ui/Field'
import { useAlert } from '@/hooks/useAlert'
import { useConfirm } from '@/hooks/useConfirm'
import {
  useCreateOffice,
  useOffices,
  useOfficeLogins,
  useSetOfficeActive,
  useUpdateOffice,
  type OfficeInput,
  type OfficeLoginAccount,
  type OfficeRow
} from '@/hooks/useOffices'
import { cn } from '@/lib/cn'
import { isUniqueViolation, toUserMessage } from '@/lib/errors'

/**
 * Admin — Office Management (client chat: Create / Edit / Activate / Deactivate Office).
 *
 * Render only for an Admin. Writes are additionally gated by the `offices_write` RLS policy,
 * so a non-admin who reached this component still could not save.
 */

const OFFICE_CODE_RE = /^[A-Z0-9_]{2,10}$/

const EMPTY_FORM: OfficeInput = { code: '', name: '', address: '', city: '', state: '', gstNo: '' }

export function OfficeManagement() {
  const { data: offices, isPending, error, refetch } = useOffices()
  const { data: officeLogins } = useOfficeLogins()
  const createOffice = useCreateOffice()
  const updateOffice = useUpdateOffice()
  const setActive = useSetOfficeActive()
  const confirm = useConfirm()
  const showAlert = useAlert()

  // office_id → its login account(s). An office usually has one; more is allowed.
  const loginsByOffice = useMemo(() => {
    const map = new Map<string, OfficeLoginAccount[]>()
    for (const login of officeLogins ?? []) {
      if (login.officeId === null) continue
      const list = map.get(login.officeId) ?? []
      list.push(login)
      map.set(login.officeId, list)
    }
    return map
  }, [officeLogins])

  const [editing, setEditing] = useState<OfficeRow | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<OfficeInput>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const isSaving = createOffice.isPending || updateOffice.isPending

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setIsFormOpen(true)
  }

  function openEdit(row: OfficeRow) {
    setEditing(row)
    setForm({
      code: row.code,
      name: row.name,
      address: row.address ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      gstNo: row.gstNo ?? ''
    })
    setFormError(null)
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditing(null)
    setFormError(null)
  }

  async function handleSubmit() {
    const code = form.code.trim().toUpperCase()
    const name = form.name.trim()

    // Client validation is UX only (rule 0.4); the DB CHECK/UNIQUE constraints are the gate.
    if (name.length === 0) return setFormError('Office name is required.')
    if (!editing && !OFFICE_CODE_RE.test(code)) {
      return setFormError('Code must be 2–10 characters: A–Z, 0–9 or underscore (e.g. DHULE_MAIN).')
    }

    try {
      if (editing) {
        await updateOffice.mutateAsync({ id: editing.id, input: form })
      } else {
        await createOffice.mutateAsync(form)
      }
      closeForm()
    } catch (err) {
      if (isUniqueViolation(err)) {
        setFormError(`An office with code “${code}” already exists.`)
        return
      }
      setFormError(toUserMessage(err))
    }
  }

  async function handleToggleActive(row: OfficeRow) {
    const nextActive = !row.isActive
    const ok = await confirm({
      title: nextActive ? 'Activate Office' : 'Deactivate Office',
      description: nextActive
        ? `Reactivate “${row.name}”? Its users will be able to work in this office again.`
        : `Deactivate “${row.name}”? Its stock history is kept, but it will be marked inactive.`,
      confirmText: nextActive ? 'Activate' : 'Deactivate'
    })
    if (!ok) return

    try {
      await setActive.mutateAsync({ id: row.id, isActive: nextActive })
    } catch (err) {
      void showAlert({ title: 'Action Failed', description: toUserMessage(err), tone: 'error' })
    }
  }

  const columns: Column<OfficeRow>[] = [
    {
      id: 'code',
      header: 'Code',
      width: 'w-32',
      cell: (row) => <span className="font-mono text-mono-id text-on-surface-variant">{row.code}</span>
    },
    {
      id: 'name',
      header: 'Office',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{row.name}</span>
          <span className="text-body-sm text-on-surface-variant/60">
            {[row.address, row.city, row.state].filter(Boolean).join(', ') || '—'}
          </span>
        </div>
      )
    },
    {
      id: 'login',
      header: 'Login',
      width: 'w-52',
      cell: (row) => {
        const logins = loginsByOffice.get(row.id) ?? []
        if (logins.length === 0) {
          // Not an error — the office simply has no login account set up yet.
          return <span className="text-body-sm text-on-surface-variant/50">Not set up</span>
        }
        return (
          <div className="flex flex-col gap-1">
            {logins.map((login) => (
              <span key={login.id} className="inline-flex items-center gap-1.5 text-body-sm">
                <KeyRound aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                <span className="text-on-surface">{login.fullName}</span>
                {login.isActive ? null : (
                  <span className="text-body-sm text-on-surface-variant/50">(inactive)</span>
                )}
              </span>
            ))}
          </div>
        )
      }
    },
    {
      id: 'status',
      header: 'Status',
      width: 'w-32',
      cell: (row) => (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-body-sm font-semibold',
            row.isActive ? 'bg-success/10 text-success' : 'bg-on-surface/5 text-on-surface-variant/70'
          )}
        >
          <span
            className={cn('size-1.5 rounded-full', row.isActive ? 'bg-success' : 'bg-on-surface-variant/50')}
          />
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => openEdit(row)}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-on-surface/5 hover:text-on-surface"
            title="Edit office"
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
          <button
            onClick={() => void handleToggleActive(row)}
            disabled={setActive.isPending}
            className={cn(
              'inline-flex items-center justify-center rounded-lg p-1.5 transition-colors disabled:opacity-50',
              row.isActive
                ? 'text-error hover:bg-error/10'
                : 'text-success hover:bg-success/10'
            )}
            title={row.isActive ? 'Deactivate office' : 'Activate office'}
          >
            {row.isActive ? (
              <PowerOff aria-hidden="true" className="size-4" />
            ) : (
              <Power aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      )
    }
  ]

  return (
    <Card className="p-6 border-border/80 bg-surface/90 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 text-on-surface font-bold text-h3">
          <Building2 className="size-5 text-primary" />
          <span>Office Management</span>
        </div>
        {isFormOpen ? null : (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={openCreate}>
            Add Office
          </Button>
        )}
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-body-sm text-on-surface-variant">
        <Info className="size-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Each office signs in with its own login. Create it in the Supabase Dashboard
          (Authentication → Add user) with user-metadata
          <span className="font-mono text-xs"> office_id</span> and
          <span className="font-mono text-xs"> is_office_login: true</span>; it then appears in the
          Login column here. Passwords are managed by Supabase — never stored in the app.
        </span>
      </div>

      {isFormOpen ? (
        <div className="mb-5 rounded-xl border border-border/60 bg-surface-variant/20 p-4">
          <h4 className="text-body-lg font-bold text-on-surface mb-3">
            {editing ? `Edit ${editing.name}` : 'New Office'}
          </h4>

          {formError ? (
            <div className="mb-3">
              <Alert tone="error">{formError}</Alert>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Code"
              mono
              required
              value={form.code}
              disabled={editing !== null}
              hint={editing ? 'Code cannot be changed after creation.' : 'e.g. DHULE_MAIN, JALGAON'}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
            <Field
              label="Office Name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Field
              label="Address / Location"
              containerClassName="md:col-span-2"
              value={form.address}
              hint="Street address of this office."
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <Field
              label="City"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <Field
              label="State"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            />
            <Field
              label="GST Number"
              mono
              containerClassName="md:col-span-2"
              value={form.gstNo}
              hint="Optional. 15-character GSTIN."
              onChange={(e) => setForm((f) => ({ ...f, gstNo: e.target.value.toUpperCase() }))}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={closeForm} disabled={isSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSubmit()} isLoading={isSaving}>
              {editing ? 'Save Changes' : 'Create Office'}
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        caption="Offices"
        columns={columns}
        emptyMessage="No offices yet. Add your first office to get started."
        error={error === null ? undefined : toUserMessage(error)}
        getRowId={(row) => row.id}
        isLoading={isPending}
        onRetry={() => void refetch()}
        rows={offices}
      />
    </Card>
  )
}
