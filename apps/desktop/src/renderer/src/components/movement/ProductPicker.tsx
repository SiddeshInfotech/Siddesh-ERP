import { PackageSearch, ScanLine } from 'lucide-react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import type { ProductPickerState } from '@/hooks/useProductPicker'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

interface ProductPickerProps {
  picker: ProductPickerState
  /** Outward makes availability the hero; inward only needs it for reference. */
  emphasiseStock?: boolean
  /** Hide the barcode scanner input (e.g. for Inward where it is not needed) */
  hideScanner?: boolean
}

/**
 * Scan-or-search product picker (SRD §5 steps 1–2, §6 steps 1–2).
 *
 * Presentational: all state lives in `useProductPicker`, so Inward and Outward share one
 * interaction rather than two that drift.
 */
export function ProductPicker({ picker, emphasiseStock = false, hideScanner = false }: ProductPickerProps) {
  const { picked, typedCode, setTypedCode, scan, choose, isNotFound, isLooking, lookupError } =
    picker

  /**
   * A USB scanner types the digits then presses Enter, so submit IS the scan event.
   * Committing here rather than on change is what makes one scan mean exactly one lookup.
   */
  function handleScan(event: FormEvent) {
    event.preventDefault()
    scan(typedCode)
  }

  return (
    <div className="flex flex-col gap-4">
      {!hideScanner && (
        <form onSubmit={handleScan}>
          <label
            className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
            htmlFor="scan-input"
          >
            Scan barcode
          </label>
          <div className="relative">
            <ScanLine
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-outline"
              strokeWidth={1.5}
            />
            <input
              // The scanner types wherever the caret is, and this screen exists to receive it.
              autoFocus
              className={cn(
                'h-14 w-full rounded-xl border-2 bg-surface-container-lowest/50 pl-12 pr-12',
                'font-mono text-h2 tracking-wide text-on-surface',
                'transition-all placeholder:font-sans placeholder:text-body-md placeholder:text-outline',
                'focus:border-primary-container',
                isNotFound ? 'border-tertiary/60' : 'border-border'
              )}
              id="scan-input"
              onChange={(event) => setTypedCode(event.target.value)}
              placeholder="Scan the box, or type the barcode and press Enter"
              spellCheck={false}
              value={typedCode}
            />
            {isLooking ? (
              <span className="absolute right-4 top-1/2 -translate-y-1/2">
                <Spinner label="Looking up the barcode" size="sm" />
              </span>
            ) : null}
          </div>
        </form>
      )}

      {lookupError === null ? null : <Alert tone="error">{toUserMessage(lookupError)}</Alert>}

      {/* SRD §13: an unknown barcode is not a failure — it is an offer to create the product. */}
      {!hideScanner && isNotFound ? (
        <Alert
          action={
            <Link
              className="whitespace-nowrap rounded-full px-3 py-1 text-body-sm font-semibold text-tertiary underline-offset-2 hover:underline"
              to="/products/new"
            >
              Create product
            </Link>
          }
          tone="warning"
        >
          Barcode not found. Is this a new product?
        </Alert>
      ) : null}

      <Select
        hint="No barcode on the box? Find it by name."
        label="Product"
        onChange={choose}
        options={(picker.products.data?.items ?? []).map((item) => ({
          value: item.id,
          label: item.name,
          description: item.skuBarcode
        }))}
        placeholder={picker.products.isPending ? 'Loading products…' : 'Search by name'}
        value={picked?.id ?? ''}
      />

      {picked === null ? (
        <div className="flex min-h-24 items-center justify-center gap-3 rounded-xl border border-dashed border-border p-5">
          <PackageSearch aria-hidden="true" className="size-5 text-outline" strokeWidth={1.5} />
          <p className="text-body-sm text-on-surface-variant/60">
            Scan a box or pick a product to continue.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-container-lowest/30 p-4">
          <div className="min-w-0">
            <p className="truncate text-h2 text-on-surface">{picked.name}</p>
            <p className="font-mono text-mono-id text-on-surface-variant/60">{picked.skuBarcode}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            {/* DESIGN.md: the storekeeper is looking at a box, not the screen. This is the
                number they came for, so it is the biggest thing here — the hero, with a
                caption beneath so the label reads over the whole figure, not just the unit. */}
            <p
              className={cn(
                'font-semibold leading-none tabular-nums',
                emphasiseStock ? 'text-[40px]' : 'text-h1',
                picked.qtyAvailable === 0 ? 'text-tertiary' : 'text-on-surface'
              )}
            >
              {picked.qtyAvailable}
            </p>
            <p className="mt-1.5 text-label-caps uppercase text-on-surface-variant/70">
              Available{picked.uom ? ` · ${picked.uom}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
