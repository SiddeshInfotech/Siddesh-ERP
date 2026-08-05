import { Info, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { useTeam, type TeamMember } from '@/hooks/useOffices'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

/**
 * Admin — User Management (client chat: office logins).
 *
 * READ-ONLY on purpose. Creating a login requires Supabase's Admin API, which runs on the
 * `service_role` key — and that key can never ship in the client (rule 0.1: the .exe is a
 * public ZIP). New logins are provisioned server-side (an Edge Function that inserts the auth
 * user with `raw_user_meta_data = { full_name, role, office_id }`; the `tg_handle_new_user`
 * trigger then creates the profile). This panel lists who already exists.
 */

const ROLE_LABELS: Record<TeamMember['role'], string> = {
  ADMIN: 'Admin',
  STORE_MANAGER: 'Store Manager',
  SALES_EXECUTIVE: 'Sales Executive'
}

export function UserManagement() {
  const { data: team, isPending, error, refetch } = useTeam()

  const columns: Column<TeamMember>[] = [
    {
      id: 'name',
      header: 'User',
      cell: (row) => <span className="font-semibold text-on-surface">{row.fullName}</span>
    },
    {
      id: 'role',
      header: 'Permission',
      width: 'w-40',
      cell: (row) => <span className="text-on-surface-variant">{ROLE_LABELS[row.role]}</span>
    },
    {
      id: 'office',
      header: 'Office',
      width: 'w-48',
      cell: (row) => (
        <span className="text-on-surface-variant">
          {row.role === 'ADMIN' ? 'All offices' : (row.officeName ?? '—')}
        </span>
      )
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
    }
  ]

  return (
    <Card className="p-6 border-border/80 bg-surface/90 shadow-sm">
      <div className="flex items-center gap-2 text-on-surface font-bold text-h3 mb-4">
        <Users className="size-5 text-primary" />
        <span>User Management</span>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-body-sm text-on-surface-variant">
        <Info className="size-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Creating a new login must be done server-side (it needs the admin key, which can never
          live in the app). Existing users and their office access are listed below.
        </span>
      </div>

      <DataTable
        caption="Users"
        columns={columns}
        emptyMessage="No users found."
        error={error === null ? undefined : toUserMessage(error)}
        getRowId={(row) => row.id}
        isLoading={isPending}
        onRetry={() => void refetch()}
        rows={team}
      />
    </Card>
  )
}
