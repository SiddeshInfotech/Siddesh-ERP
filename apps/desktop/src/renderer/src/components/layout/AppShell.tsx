import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/**
 * The authenticated frame: fixed sidebar, top bar, scrolling content pane.
 *
 * Only the content pane scrolls. `body` has `overflow: hidden`, so the sidebar and top bar
 * stay put no matter how long a ledger gets.
 */
export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-container">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
