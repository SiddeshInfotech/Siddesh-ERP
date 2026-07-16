import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/hooks/useAuth'
import { SidebarProvider } from '@/hooks/useSidebar'
import { ThemeProvider } from '@/hooks/useTheme'
import { Dashboard } from '@/routes/Dashboard'
import { Login } from '@/routes/Login'
import { Placeholder } from '@/routes/Placeholder'
import './styles.css'

/**
 * Hash history, not browser history: production loads over file://, where there is no
 * server to resolve path routes.
 */
const router = createHashRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'products', element: <Placeholder arrives="on Day 2" title="Products" /> },
      { path: 'inward', element: <Placeholder arrives="on Day 3" title="Inward" /> },
      { path: 'outward', element: <Placeholder arrives="on Day 3" title="Outward" /> },
      { path: 'stock', element: <Placeholder arrives="on Day 4" title="Stock" /> },
      { path: 'reports', element: <Placeholder arrives="on Day 4" title="Reports" /> }
    ]
  }
])

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The app runs on office wifi all day; refetching on every window focus would hammer
      // the database for no benefit. Stock views override this with a shorter staleTime.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: 1
    }
  }
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found in index.html')

// ThemeProvider sits outermost so even the ErrorBoundary's fallback screen is themed —
// a crash should not also flash the wrong colour scheme at the user.
createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SidebarProvider>
              <RouterProvider router={router} />
            </SidebarProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
)
