import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { logger } from '@/lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches render-time crashes anywhere below it.
 *
 * Without this, one thrown error unmounts the whole tree and the storekeeper is left
 * staring at a white window with no way back — the worst possible failure for a tool
 * someone is using while holding a box.
 *
 * Class component by necessity: React has no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Unhandled render error', {
      message: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? ''
    })
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-container text-center">
        <h1 className="text-h1 text-on-surface">Something went wrong</h1>
        <p className="max-w-md text-body-md text-on-surface-variant/70">
          The app hit an unexpected problem. Your saved data is safe — nothing is lost.
        </p>
        {/* Full reload rather than clearing the flag: the tree's state is untrustworthy
            once a render has thrown. */}
        <Button onClick={() => window.location.reload()}>Reload the app</Button>
      </div>
    )
  }
}
