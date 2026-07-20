import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Barcode,
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
  { to: '/barcodes', label: 'Barcodes', icon: Barcode },
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
        'flex shrink-0 flex-col gap-3 p-3 transition-[width] duration-200 ease-out',
        isCollapsed ? 'w-20' : 'w-sidebar'
      )}
    >
      {/* Box 1: Header & Main Navigation */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface/80 p-3 shadow-sm backdrop-blur-md">
        {/* Brand Header */}
        <div className={cn('pb-3 border-b border-border/50 mb-2 px-2 py-1', isCollapsed && 'px-0 text-center')}>
          {isCollapsed ? (
            <span aria-hidden="true" className="text-h2 font-bold text-primary">
              S
            </span>
          ) : (
            <div>
              <h1 className="text-h2 font-bold tracking-tight text-on-surface">Siddesh</h1>
              <p className="text-body-sm font-medium text-on-surface-variant/60">Inventory ERP</p>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                aria-label={isCollapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-md font-medium transition-all',
                    isCollapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary/10 font-semibold text-primary shadow-xs'
                      : 'text-on-surface-variant hover:bg-surface-variant/40 hover:text-on-surface'
                  )
                }
                end={to === '/'}
                title={isCollapsed ? label : undefined}
                to={to}
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                      />
                    ) : null}
                    <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.5} />
                    {isCollapsed ? null : <span>{label}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Box 2: Actions & Controls (Light Mode, Collapse, Log Out) */}
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface/80 p-2 shadow-sm backdrop-blur-md">
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
