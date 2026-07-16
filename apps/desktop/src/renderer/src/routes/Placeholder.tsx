import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface PlaceholderProps {
  title: string
  /** Which sprint day delivers this, so the screen is honest about what is missing. */
  arrives: string
}

/**
 * Stub for a route that navigates but is not built yet (DSK-108).
 *
 * Deliberately says what is missing and when it lands. A blank page reads as a bug and
 * generates a support call; this does not.
 */
export function Placeholder({ title, arrives }: PlaceholderProps) {
  return (
    <div className="flex flex-col gap-gutter">
      <h1 className="text-h1 text-on-surface">{title}</h1>
      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Construction aria-hidden="true" className="size-8 text-outline-variant" strokeWidth={1.5} />
        <p className="text-body-md text-on-surface-variant/70">
          {title} is not built yet — it arrives {arrives}.
        </p>
      </Card>
    </div>
  )
}
