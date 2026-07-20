import { ChevronRight, Pencil, PowerOff, Power } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LabelPrintPanel } from '@/components/products/LabelPrintPanel'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SpinnerPane } from '@/components/ui/Spinner'
import { useProduct } from '@/hooks/useProduct'
import { useSetProductActive } from '@/hooks/useProductMutations'
import { useProductStock } from '@/hooks/useProducts'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

/**
 * Read-only view of one product, plus its live stock and its label (DSK-219).
 *
 * The available quantity is the largest thing on the screen (DESIGN.md): the storekeeper is
 * looking at a box, not at the monitor, and this is the number they came for.
 */

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 hairline-b last:border-b-0">
      <dt className="shrink-0 text-body-sm text-on-surface-variant/70">{label}</dt>
      <dd className="text-right text-body-md text-on-surface">{children}</dd>
    </div>
  )
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: product, isPending, error, refetch } = useProduct(id)
  const stock = useProductStock(id)
  const setActive = useSetProductActive()

  if (isPending) {
    return (
      <Card>
        <SpinnerPane label="Loading the product…" />
      </Card>
    )
  }

  if (error !== null) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">Product</h1>
        <Alert
          action={
            <button
              className="rounded-full px-3 py-1 text-body-sm font-semibold text-error underline-offset-2 hover:underline"
              onClick={() => void refetch()}
              type="button"
            >
              Retry
            </button>
          }
          tone="error"
        >
          {toUserMessage(error)}
        </Alert>
      </div>
    )
  }

  if (product === null) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">Product not found</h1>
        <Alert tone="warning">
          This product no longer exists.{' '}
          <Link className="underline underline-offset-2" to="/products">
            Back to products
          </Link>
        </Alert>
      </div>
    )
  }

  const isLowStock = (stock.data?.qtyAvailable ?? 0) <= product.minStock
  const aliases = product.barcodes.filter((barcode) => !barcode.isPrimary)

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-body-sm">
            <Link className="text-on-surface-variant/60 hover:text-on-surface" to="/products">
              Products
            </Link>
            <ChevronRight aria-hidden="true" className="size-3.5 text-outline" strokeWidth={1.5} />
            <span className="text-on-surface-variant">{product.name}</span>
          </nav>

          <h1 className="text-h1 text-on-surface">{product.name}</h1>
          <p className="font-mono text-mono-id text-on-surface-variant/60">{product.skuBarcode}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            icon={
              product.isActive ? (
                <PowerOff aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
              ) : (
                <Power aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
              )
            }
            isLoading={setActive.isPending}
            onClick={() => setActive.mutate({ id: product.id, isActive: !product.isActive })}
            variant="secondary"
          >
            {product.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>

          <Button
            icon={<Pencil aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
            onClick={() => void navigate(`/products/${product.id}/edit`)}
          >
            Edit
          </Button>
        </div>
      </div>

      {product.isActive ? null : (
        <Alert tone="warning">
          This product is inactive. Its history is kept, but it should not be used for new
          entries.
        </Alert>
      )}

      {setActive.error === null ? null : (
        <Alert tone="error">{toUserMessage(setActive.error)}</Alert>
      )}

      <div className="grid grid-cols-3 gap-gutter">
        <div className="col-span-2 flex flex-col gap-gutter">
          <Card>
            <CardHeader title="Stock" />
            <div className="flex items-end gap-8 p-5">
              <div>
                <p className="text-label-caps uppercase text-on-surface-variant">Available</p>
                {stock.isPending ? (
                  <p className="text-h1 text-on-surface-variant/40">—</p>
                ) : (
                  <p
                    className={cn(
                      'text-[44px] font-semibold leading-none tabular-nums',
                      isLowStock ? 'text-tertiary' : 'text-on-surface'
                    )}
                  >
                    {stock.data?.qtyAvailable ?? 0}
                    <span className="ml-2 text-h2 font-normal text-on-surface-variant/60">
                      {product.uomCode ?? ''}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1 pb-1">
                <p className="text-body-sm text-on-surface-variant/70">
                  On hand: <span className="tabular-nums">{stock.data?.qtyOnHand ?? 0}</span>
                </p>
                <p className="text-body-sm text-on-surface-variant/70">
                  Minimum: <span className="tabular-nums">{product.minStock}</span>
                </p>
              </div>

              {isLowStock && !stock.isPending ? (
                <Alert className="ml-auto" tone="warning">
                  At or below the minimum level.
                </Alert>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="px-5 pb-2 pt-1">
              <DetailRow label="Category">{product.categoryName ?? '—'}</DetailRow>
              <DetailRow label="Brand">{product.brandName ?? '—'}</DetailRow>
              <DetailRow label="Model number">{product.modelNumber ?? '—'}</DetailRow>
              <DetailRow label="Unit">{product.uomCode ?? '—'}</DetailRow>
              <DetailRow label="HSN code">{product.hsnCode ?? '—'}</DetailRow>
              <DetailRow label="GST">
                {/* ?? not ||: a real 0% must read "0%", not "—". */}
                {product.gstPercent === null ? '—' : `${product.gstPercent}%`}
              </DetailRow>
              <DetailRow label="Tracking">
                {product.trackingMode === 'SERIAL' ? 'Serial numbers' : 'Quantity'}
              </DetailRow>
              <DetailRow label="Description">
                <span className="whitespace-pre-wrap">{product.description ?? '—'}</span>
              </DetailRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Barcodes" />
            <div className="flex flex-col gap-2 p-5">
              {product.barcodes.map((barcode) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  key={barcode.id}
                >
                  <span className="font-mono text-mono-id text-on-surface">{barcode.code}</span>
                  <span className="text-body-sm text-on-surface-variant/60">
                    {barcode.isPrimary ? 'Generated — printed on our label' : "Manufacturer's code"}
                  </span>
                </div>
              ))}
              {aliases.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant/60">
                  Scanning the manufacturer&apos;s own barcode will not find this product. Edit it
                  to add that code.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Label" />
          <LabelPrintPanel code={product.skuBarcode} productName={product.name} />
        </Card>
      </div>
    </div>
  )
}
