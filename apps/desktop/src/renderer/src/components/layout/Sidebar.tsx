import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Warehouse
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from '@/hooks/useSidebar'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** Navigation maps to the SRD modules (§1), in the order a storekeeper's day runs. */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inward', label: 'Inward', icon: ArrowDownToLine },
  { to: '/outward', label: 'Outward', icon: ArrowUpFromLine },
  { to: '/stock', label: 'Stock', icon: Warehouse },
  { to: '/reports', label: 'Reports', icon: BarChart3 }
]

interface RailButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  isCollapsed: boolean
}

/**
 * Bottom-rail action (theme, collapse, log out).
 *
 * When collapsed the label is still rendered for screen readers via aria-label and shown
 * to sighted users as a native tooltip — an icon-only button with no accessible name is
 * unusable with a keyboard or a reader.
 */
function RailButton({ icon: Icon, label, onClick, isCollapsed }: RailButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body-md',
        'text-on-surface-variant transition-colors',
        'hover:bg-surface-variant/30 hover:text-on-surface',
        isCollapsed && 'justify-center px-0'
      )}
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      type="button"
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.5} />
      {isCollapsed ? null : label}
    </button>
  )
}

/**
 * Left navigation. 208px expanded, 64px collapsed (DESIGN.md sets the expanded width).
 *
 * Active state: violet text plus a 2px bar on the extreme left. Colour alone never conveys
 * the active item — the bar carries it too, for anyone who cannot distinguish the violet,
 * and it is the only active cue left once the labels are hidden.
 */
export function Sidebar() {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { isCollapsed, toggleCollapsed } = useSidebar()

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex shrink-0 flex-col border-r border-dashed border-outline-variant/30 bg-surface',
        'transition-[width] duration-200 ease-out',
        isCollapsed ? 'w-16' : 'w-sidebar'
      )}
    >
      <div className={cn('px-5 py-4', isCollapsed && 'px-0 text-center')}>
        {isCollapsed ? (
          <span aria-hidden="true" className="text-h2 font-semibold text-primary">
            S
          </span>
        ) : (
          <>
            <h1 className="text-h2 tracking-tight text-on-surface">Siddesh</h1>
            <p className="text-body-sm text-on-surface-variant/60">Inventory</p>
          </>
        )}
      </div>

      <ul className={cn('flex flex-1 flex-col gap-1 py-2', isCollapsed ? 'px-2' : 'px-3')}>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              aria-label={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors',
                  isCollapsed && 'justify-center px-0',
                  isActive
                    ? 'font-semibold text-primary'
                    : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface'
                )
              }
              // `end` stops "/" matching every route and lighting up permanently.
              end={to === '/'}
              title={isCollapsed ? label : undefined}
              to={to}
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                    />
                  ) : null}
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.5} />
                  {isCollapsed ? null : label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={cn('flex flex-col gap-1 hairline-t p-2', !isCollapsed && 'p-3')}>
        <RailButton
          icon={theme === 'dark' ? Sun : Moon}
          isCollapsed={isCollapsed}
          label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={toggleTheme}
        />
        <RailButton
          icon={isCollapsed ? PanelLeftOpen : PanelLeftClose}
          isCollapsed={isCollapsed}
          label={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={toggleCollapsed}
        />
        <RailButton
          icon={LogOut}
          isCollapsed={isCollapsed}
          label="Log Out"
          onClick={() => void signOut()}
        />
      </div>
    </nav>
  )
}
