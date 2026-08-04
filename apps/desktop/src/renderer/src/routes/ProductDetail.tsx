import { ChevronRight, ChevronDown, Pencil, PowerOff, Power, Package, ArrowDownToLine, ArrowUpFromLine, Ban, Scan, User, MapPin, Search } from 'lucide-react'
import { useState, useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { SpinnerPane } from '@/components/ui/Spinner'
import { Timeline } from '@/components/ui/Timeline'
import { useProduct } from '@/hooks/useProduct'
import { useSetProductActive } from '@/hooks/useProductMutations'
import { useProductStock } from '@/hooks/useProducts'
import { useBarcodeTimeline } from '@/hooks/useBarcodeTimeline'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

interface BarcodeTimelineProps {
  barcodeId: string
}

const BARCODE_ICONS = {
  GENERATED: Package,
  RECEIVE: ArrowDownToLine,
  ISSUE: ArrowUpFromLine,
  VOID: Ban
}

const BARCODE_COLORS = {
  GENERATED: 'text-primary bg-primary/10 border-primary/20',
  RECEIVE: 'text-success bg-success/10 border-success/20',
  ISSUE: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  VOID: 'text-error bg-error/10 border-error/20'
}

function BarcodeTimeline({ barcodeId }: BarcodeTimelineProps) {
  const { data: events, isPending } = useBarcodeTimeline(barcodeId)

  const formatTime = (d: Date) => 
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d)
    
  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d)

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner className="size-4 text-primary" />
        <span className="text-body-sm text-on-surface-variant ml-2">Loading barcode history...</span>
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className="py-4 text-center text-body-sm text-on-surface-variant/60">
        No scan history available for this barcode.
      </div>
    )
  }

  return (
    <div className="relative pl-6 mt-2 pb-2">
      {/* Vertical Line */}
      <div className="absolute left-2 top-2 bottom-2 w-px bg-border/60" />

      <div className="flex flex-col gap-5">
        {events.map((event) => {
          const Icon = BARCODE_ICONS[event.action]
          const colorClass = BARCODE_COLORS[event.action]
          const date = new Date(event.timestamp)

          let actionTitle = ''
          if (event.action === 'GENERATED') actionTitle = 'Barcode Registered'
          else if (event.action === 'RECEIVE') actionTitle = 'Physically Received'
          else if (event.action === 'ISSUE') actionTitle = 'Dispatched (Outward)'
          else if (event.action === 'VOID') actionTitle = 'Barcode Voided'

          return (
            <div key={event.id} className="relative flex flex-col gap-1 pl-4">
              {/* Dot Icon */}
              <div className={`absolute -left-[23px] top-0.5 mt-0.5 flex size-[14px] items-center justify-center rounded-full border shadow-sm ${colorClass}`}>
                <Icon className="size-2" />
              </div>

              {/* Event Info */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-body-sm text-on-surface">{actionTitle}</span>
                <span className="text-label-sm text-on-surface-variant/60 font-mono">
                  {formatDate(date)} {formatTime(date)}
                </span>
              </div>

              {/* Subdetails */}
              <div className="flex flex-wrap gap-x-4 text-label-md text-on-surface-variant/80">
                <div className="flex items-center gap-1">
                  <User className="size-3 text-outline" />
                  <span>{event.byName}</span>
                </div>
                {event.officeName && (
                  <div className="flex items-center gap-1">
                    <MapPin className="size-3 text-outline" />
                    <span>{event.officeName}</span>
                  </div>
                )}
                {event.deviceSource && (
                  <div className="flex items-center gap-1">
                    <Scan className="size-3 text-outline" />
                    <span>via {event.deviceSource}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

const BARCODE_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'INWARDED', label: 'Inwarded' },
  { value: 'OUTWARDED', label: 'Outwarded' },
  { value: 'MISSING', label: 'Missing' }
]

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [expandedBarcodeId, setExpandedBarcodeId] = useState<string | null>(null)
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [barcodeStatusFilter, setBarcodeStatusFilter] = useState('ALL')

  const { data: product, isPending, error, refetch } = useProduct(id)
  const stock = useProductStock(id)
  const setActive = useSetProductActive()

  const filteredBarcodes = useMemo(() => {
    if (!product) return []
    const term = barcodeSearch.trim().toLowerCase()
    
    return product.barcodes.filter((barcode) => {
      if (term && !barcode.code.toLowerCase().includes(term)) {
        return false
      }
      
      if (barcodeStatusFilter !== 'ALL') {
        if (barcodeStatusFilter === 'MISSING') {
          if (!['VOID', 'DAMAGED', 'CANCELLED'].includes(barcode.status)) return false
        } else if (barcodeStatusFilter === 'INWARDED') {
          if (!['INWARDED', 'IN_STOCK'].includes(barcode.status)) return false
        } else if (barcodeStatusFilter === 'OUTWARDED') {
          if (!['OUTWARDED', 'OUTWARD'].includes(barcode.status)) return false
        } else if (barcodeStatusFilter === 'GENERATED') {
          if (barcode.status !== 'GENERATED') return false
        }
      }
      return true
    })
  }, [product, barcodeSearch, barcodeStatusFilter])

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
            <div className="flex items-center gap-3 border-b border-border p-4 bg-surface-container-lowest/30">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
                  strokeWidth={1.5}
                />
                <input
                  className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-body-sm text-on-surface transition-all placeholder:text-outline focus:border-primary-container"
                  onChange={(e) => setBarcodeSearch(e.target.value)}
                  placeholder="Search by barcode ID..."
                  type="search"
                  value={barcodeSearch}
                />
              </div>
              <Select
                containerClassName="w-40"
                onChange={setBarcodeStatusFilter}
                options={BARCODE_STATUS_OPTIONS}
                value={barcodeStatusFilter}
              />
            </div>
            <div className="flex flex-col lg:flex-row gap-6 p-5 items-start">
              {/* Left Column: History/Timeline */}
              <div className="w-full lg:w-[350px] xl:w-[400px] flex-shrink-0 bg-surface-container-lowest/30 rounded-xl border border-border p-5 max-h-[600px] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-border/60">
                  <h3 className="text-title-md font-semibold text-on-surface">
                    {expandedBarcodeId ? 'Barcode History' : 'Product History'}
                  </h3>
                  {expandedBarcodeId && (
                    <button 
                      onClick={() => setExpandedBarcodeId(null)}
                      className="text-label-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      View All
                    </button>
                  )}
                </div>
                
                {expandedBarcodeId ? (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-surface border border-border px-3 py-1.5 shadow-sm">
                      <Scan className="size-3.5 text-outline" />
                      <span className="text-label-sm font-mono text-on-surface font-semibold">
                        {product.barcodes.find(b => b.id === expandedBarcodeId)?.code}
                      </span>
                    </div>
                    <div className="pl-1">
                      <BarcodeTimeline barcodeId={expandedBarcodeId} />
                    </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                    <Timeline productId={product.id} />
                  </div>
                )}
              </div>

              {/* Right Column: Barcodes Grid */}
              <div className="flex-1 w-full min-w-0">
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                  {filteredBarcodes.map((barcode) => (
                    <button
                      key={barcode.id}
                      type="button"
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-colors overflow-hidden",
                        expandedBarcodeId === barcode.id 
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                          : "border-border bg-surface-container-lowest/20 hover:bg-surface-container-lowest/60"
                      )}
                      onClick={() => setExpandedBarcodeId(expandedBarcodeId === barcode.id ? null : barcode.id)}
                    >
                      <span 
                        className="font-mono text-label-md text-on-surface font-semibold mb-1.5 w-full truncate" 
                        title={barcode.code}
                      >
                        {barcode.code}
                      </span>
                      <span className={cn(
                        'text-[10px] font-bold rounded-full px-2 py-0.5 border uppercase tracking-wider',
                        ['IN_STOCK', 'INWARDED', 'AVAILABLE', 'ALLOCATED'].includes(barcode.status) && 'text-success bg-success/10 border-success/20',
                        ['OUTWARD', 'OUTWARDED'].includes(barcode.status) && 'text-amber-600 bg-amber-500/10 border-amber-500/20',
                        ['VOID', 'DAMAGED', 'CANCELLED'].includes(barcode.status) && 'text-error bg-error/10 border-error/20',
                        barcode.status === 'GENERATED' && 'text-primary bg-primary/10 border-primary/20'
                      )}>
                        {barcode.status === 'IN_STOCK' ? 'IN STOCK' : barcode.status === 'OUTWARD' ? 'DISPATCHED' : barcode.status.replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>

                {filteredBarcodes.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="size-12 rounded-full bg-surface-container flex items-center justify-center mb-3">
                      <Scan className="size-6 text-on-surface-variant/40" />
                    </div>
                    <p className="text-body-md font-medium text-on-surface">No barcodes found</p>
                    <p className="text-body-sm text-on-surface-variant/70 mt-1">
                      No barcodes match your search or filter criteria.
                    </p>
                  </div>
                )}
                {aliases.length === 0 ? (
                  <Alert tone="info" className="mt-6">
                    Scanning the manufacturer's own barcode will not find this product. Edit it to add that code.
                  </Alert>
                ) : null}
              </div>
            </div>
          </Card>

    </div>
  )
}
