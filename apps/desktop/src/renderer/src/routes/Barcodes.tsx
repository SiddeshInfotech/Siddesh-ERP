import { useState, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Barcode,
  Printer,
  Sparkles,
  Layers,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertCircle,
  Inbox,
  Trash2
} from 'lucide-react'
import { BarcodeCanvasA4, type BarcodeLabelData } from '@/components/barcode/BarcodeCanvasA4'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SpinnerPane } from '@/components/ui/Spinner'
import { useAllBatches, type BatchRegistryRow } from '@/hooks/useAllBatches'
import {
  useBatchBarcodes,
  useDeleteBatch,
  useDeleteBarcode,
  type BarcodeStatus,
  type BatchBarcodeRow
} from '@/hooks/useBatchBarcodes'
import { useCategories } from '@/hooks/useProductLookups'
import { useConfirm } from '@/hooks/useConfirm'
import { useAlert } from '@/hooks/useAlert'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 25

type SortId = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'qty-desc'

const SORT_OPTIONS: SelectOption[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name-asc', label: 'Product Name (A to Z)' },
  { value: 'name-desc', label: 'Product Name (Z to A)' },
  { value: 'qty-desc', label: 'Batch Qty (High to Low)' }
]

const TYPE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All barcode types' },
  { value: 'auto', label: 'Auto-generated (Option A)' },
  { value: 'manufacturer', label: 'Manufacturer (Option B)' }
]

const COMPARATORS: Record<SortId, (a: BatchRegistryRow, b: BatchRegistryRow) => number> = {
  newest: (a, b) => new Date(b.batchCreatedAt || 0).getTime() - new Date(a.batchCreatedAt || 0).getTime(),
  oldest: (a, b) => new Date(a.batchCreatedAt || 0).getTime() - new Date(b.batchCreatedAt || 0).getTime(),
  'name-asc': (a, b) => a.productName.localeCompare(b.productName),
  'name-desc': (a, b) => b.productName.localeCompare(a.productName),
  'qty-desc': (a, b) => b.totalBarcodes - a.totalBarcodes
}

const STATUS_STYLES: Record<BarcodeStatus, string> = {
  GENERATED: 'bg-on-surface/[0.06] text-on-surface-variant',
  IN_STOCK: 'bg-success/10 text-success',
  OUTWARD: 'bg-primary/10 text-primary',
  VOID: 'bg-error/10 text-error',
  AVAILABLE: 'bg-success/10 text-success',
  ALLOCATED: 'bg-warning/10 text-warning-dark',
  INWARDED: 'bg-success/10 text-success',
  OUTWARDED: 'bg-primary/10 text-primary',
  DAMAGED: 'bg-error/10 text-error',
  CANCELLED: 'bg-error/10 text-error'
}

const STATUS_LABEL: Record<BarcodeStatus, string> = {
  GENERATED: 'Generated',
  IN_STOCK: 'In stock',
  OUTWARD: 'Outward',
  VOID: 'Void',
  AVAILABLE: 'Available',
  ALLOCATED: 'Allocated',
  INWARDED: 'Inwarded',
  OUTWARDED: 'Outwarded',
  DAMAGED: 'Damaged',
  CANCELLED: 'Cancelled'
}

function StatusBadge({ status }: { status: BarcodeStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-medium',
        STATUS_STYLES[status] || STATUS_STYLES.GENERATED
      )}
    >
      {STATUS_LABEL[status] || status}
    </span>
  )
}

/**
 * Inline sub-table displaying the individual barcode sticker records for an expanded batch row.
 * Powered by v_batch_barcodes via useBatchBarcodes hook.
 */
function BatchBarcodesSubTable({ productId, batchCode }: { productId: string; batchCode: string }) {
  const { data: barcodes, isLoading, isError, error } = useBatchBarcodes(productId, batchCode)
  const deleteBarcode = useDeleteBarcode()
  const confirm = useConfirm()
  const showAlert = useAlert()

  const handleDeleteBarcode = async (row: BatchBarcodeRow) => {
    const ok = await confirm({
      title: 'Delete Barcode Sticker',
      description: `Are you sure you want to delete barcode "${row.code}"?`,
      confirmText: 'Delete Sticker'
    })
    if (!ok) return
    try {
      await deleteBarcode.mutateAsync(row.id)
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete barcode.'
      void showAlert({
        title: msg.includes('Cannot delete') ? 'Cannot Delete Item' : 'Action Failed',
        description: msg,
        tone: 'warning'
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-on-surface-variant text-body-sm">
        <Activity className="mr-2 size-4 animate-spin text-primary" />
        <span>Loading batch barcodes…</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-4 px-6 text-error text-body-sm flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" />
        <span>Error loading barcodes: {error?.message || String(error)}</span>
      </div>
    )
  }

  if (!barcodes || barcodes.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant/70 text-body-sm italic">
        No individual barcode stickers found for this batch.
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border/60 overflow-hidden shadow-sm m-4">
      <div className="bg-surface-variant/30 px-4 py-2.5 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
        <span className="text-label-caps uppercase text-on-surface-variant font-semibold">
          Sticker List ({barcodes.length} total)
        </span>
        <div className="flex items-center gap-3 text-body-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-success"></span> In Stock: {barcodes.filter(b => b.status === 'IN_STOCK').length}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-on-surface-variant/40"></span> Generated: {barcodes.filter(b => b.status === 'GENERATED').length}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary"></span> Outward: {barcodes.filter(b => b.status === 'OUTWARD').length}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-error"></span> Void: {barcodes.filter(b => b.status === 'VOID').length}
          </span>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full border-collapse text-left text-body-sm">
          <thead className="bg-on-surface/[0.02] sticky top-0 z-10 hairline-b text-label-caps uppercase text-on-surface-variant/70">
            <tr>
              <th className="px-4 py-2 font-semibold w-12 text-center">#</th>
              <th className="px-4 py-2 font-semibold">Barcode Number</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Scanned At</th>
              <th className="px-4 py-2 font-semibold">Performed By</th>
              <th className="px-4 py-2 font-semibold">Device</th>
              <th className="px-4 py-2 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {barcodes.map((row, idx) => (
              <tr key={row.id || row.code || idx} className="hover:bg-on-surface/[0.03] transition-colors">
                <td className="px-4 py-2 text-on-surface-variant/60 font-mono text-xs text-center">{idx + 1}</td>
                <td className="px-4 py-2 font-mono font-bold text-on-surface">{row.code}</td>
                <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-2 text-on-surface-variant font-mono text-xs">
                  {row.scanned_at ? new Date(row.scanned_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2 text-on-surface">{row.scanned_by_name ?? '—'}</td>
                <td className="px-4 py-2 text-on-surface-variant text-xs font-mono">{row.device_source ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDeleteBarcode(row)}
                    disabled={deleteBarcode.isPending}
                    className="text-on-surface-variant hover:text-error transition-colors p-1 rounded hover:bg-error/10 disabled:opacity-50"
                    title="Delete barcode sticker"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Fullscreen Print Canvas wrapper for a batch. Loads all individual barcode codes from useBatchBarcodes
 * and renders them onto BarcodeCanvasA4 for physical label printing.
 */
function BatchPrintView({ batch, onBack }: { batch: BatchRegistryRow; onBack: () => void }) {
  const { data: barcodes, isLoading, isError, error } = useBatchBarcodes(batch.productId, batch.batchCode)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Activity className="size-8 animate-spin text-primary" />
        <p className="text-body-md text-on-surface-variant">Loading barcodes for printing ({batch.batchCode})…</p>
        <Button variant="secondary" onClick={onBack}>Cancel</Button>
      </div>
    )
  }

  if (isError || !barcodes || barcodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertCircle className="size-8 text-error" />
        <p className="text-body-md text-error">
          Failed to load barcodes for printing: {error?.message || 'No individual barcodes found in this batch.'}
        </p>
        <Button variant="secondary" onClick={onBack}>Back</Button>
      </div>
    )
  }

  const items: BarcodeLabelData[] = barcodes.map((b) => ({
    barcode: b.code,
    productName: batch.productName,
    categoryOrModel: batch.categoryName || undefined,
    brand: batch.brandName || undefined
  }))

  return <BarcodeCanvasA4 items={items} onBack={onBack} />
}

export function Barcodes() {
  const navigate = useNavigate()
  const { data: batches, isPending, error: fetchError, refetch } = useAllBatches()
  const { data: categories } = useCategories()

  // Main Page Filters & Paging
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sort, setSort] = useState<SortId>('newest')
  const [page, setPage] = useState(0)

  // Expanded Batch Row State
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null)

  // Print View State
  const [printBatch, setPrintBatch] = useState<BatchRegistryRow | null>(null)

  const deleteBatch = useDeleteBatch()
  const confirm = useConfirm()
  const showAlert = useAlert()
  const handleDeleteBatch = async (row: BatchRegistryRow) => {
    const ok = await confirm({
      title: 'Delete Barcode Batch',
      description: `Are you sure you want to delete batch "${row.batchCode}" (${row.productName})?\n\nAll ${row.totalBarcodes} barcodes in this batch will also be permanently deleted.`,
      confirmText: 'Delete Batch'
    })
    if (!ok) return
    try {
      await deleteBatch.mutateAsync(row.batchId)
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete batch.'
      void showAlert({
        title: msg.includes('Cannot delete') ? 'Cannot Delete Item' : 'Action Failed',
        description: msg,
        tone: 'warning'
      })
    }
  }

  // Category Select Options
  const categoryOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All categories' }]
    if (categories) {
      for (const cat of categories) {
        opts.push({ value: cat.value, label: cat.label })
      }
    }
    return opts
  }, [categories])

  // Filtered & Sorted Batches for main table
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const allBatches = batches ?? []

    return allBatches
      .filter((row) => {
        if (categoryId !== '' && row.categoryId !== categoryId) return false

        const isAuto = row.firstBarcodeCode && (row.firstBarcodeCode.startsWith('ST') || row.firstBarcodeCode.includes('-'))
        if (typeFilter === 'auto' && !isAuto) return false
        if (typeFilter === 'manufacturer' && (!row.firstBarcodeCode || isAuto)) return false

        if (term === '') return true
        const haystack = [
          row.productName,
          row.skuBarcode,
          row.batchCode,
          row.categoryName,
          row.brandName,
          row.firstBarcodeCode
        ]
        return haystack.some((v) => v !== null && v.toLowerCase().includes(term))
      })
      .sort(COMPARATORS[sort])
  }, [batches, search, categoryId, typeFilter, sort])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function changeFilter(apply: () => void) {
    apply()
    setPage(0)
    setExpandedBatchId(null)
  }

  // If in Print View for a batch
  if (printBatch) {
    return <BatchPrintView batch={printBatch} onBack={() => setPrintBatch(null)} />
  }

  return (
    <div className="flex flex-col gap-gutter">
      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Batch Barcode Registry</h1>
          <p className="text-body-sm text-on-surface-variant/60">
            {isPending
              ? 'Loading batch registry…'
              : `${visible.length} of ${batches?.length ?? 0} ${(batches?.length ?? 0) === 1 ? 'batch' : 'batches'}`}
          </p>
        </div>

        <Button
          icon={<Plus aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
          onClick={() => void navigate('/barcodes/generate')}
        >
          Generate barcode
        </Button>
      </div>

      {fetchError && (
        <Alert
          tone="error"
          action={
            <button
              className="rounded-full px-3 py-1 text-body-sm font-semibold text-error underline-offset-2 hover:underline"
              onClick={() => void refetch()}
              type="button"
            >
              Retry
            </button>
          }
        >
          {(fetchError as Error).message || 'Failed to load batch registry.'}
        </Alert>
      )}

      {/* BATCH BARCODE REGISTRY CARD */}
      <Card>
        {/* Hairline-b Filter Strip */}
        <div className="flex flex-wrap items-end gap-3 hairline-b p-4">
          <div className="flex flex-1 min-w-[240px] flex-col">
            <label
              className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
              htmlFor="batch-search"
            >
              Search Batches
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
                strokeWidth={1.5}
              />
              <input
                className="h-10 w-full rounded-xl border border-border bg-surface-container-lowest/50 pl-9 pr-4 text-on-surface transition-all placeholder:text-outline focus:border-primary-container"
                id="batch-search"
                onChange={(event) => changeFilter(() => setSearch(event.target.value))}
                placeholder="Product name, batch code, initial barcode, category or brand"
                type="search"
                value={search}
              />
            </div>
          </div>

          <Select
            containerClassName="w-48"
            label="Category"
            onChange={(val) => changeFilter(() => setCategoryId(val))}
            options={categoryOptions}
            value={categoryId}
          />

          <Select
            containerClassName="w-48"
            label="Barcode Type"
            onChange={(val) => changeFilter(() => setTypeFilter(val))}
            options={TYPE_OPTIONS}
            value={typeFilter}
          />

          <Select
            containerClassName="w-48"
            label="Sort by"
            onChange={(val) => changeFilter(() => setSort(val as SortId))}
            options={SORT_OPTIONS}
            value={sort}
          />
        </div>

        {/* Data Table */}
        {isPending ? (
          <SpinnerPane />
        ) : rows.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-5">
            <Inbox aria-hidden="true" className="size-8 text-outline" strokeWidth={1.5} />
            <p className="text-body-sm text-on-surface-variant/70">No matching batch barcode records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-on-surface/[0.03]">
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70">Barcode Initial</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70">Product</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70">Batch Code</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70">Category</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70">Brand</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70">Barcode Type</th>
                  <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70">Batch Qty</th>
                  <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70">Total Stock</th>
                  <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const isExpanded = expandedBatchId === row.batchId
                  const isAuto = row.firstBarcodeCode && (row.firstBarcodeCode.startsWith('ST') || row.firstBarcodeCode.includes('-'))

                  return (
                    <Fragment key={row.batchId || `row-${rowIdx}`}>
                      <tr
                        className={cn(
                          'h-row hairline-b transition-colors cursor-pointer hover:bg-on-surface/5',
                          isExpanded && 'bg-on-surface/[0.04]'
                        )}
                        onClick={() => setExpandedBatchId(isExpanded ? null : row.batchId)}
                      >
                        <td className="px-4 text-table-cell font-mono font-semibold text-primary">
                          <div className="flex items-center gap-2">
                            <Barcode className="size-4 text-primary shrink-0" />
                            <span>{row.firstBarcodeCode || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 text-table-cell">
                          <div>
                            <div className="font-semibold text-on-surface text-body-sm">{row.productName}</div>
                            <div className="text-[11px] text-on-surface-variant/60">{row.skuBarcode || 'No SKU'}</div>
                          </div>
                        </td>
                        <td className="px-4 text-table-cell font-mono text-body-sm font-medium text-on-surface">
                          {row.batchCode}
                        </td>
                        <td className="px-4 text-table-cell">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-variant/40 text-on-surface-variant">
                            {row.categoryName || 'General'}
                          </span>
                        </td>
                        <td className="px-4 text-table-cell text-body-sm text-on-surface-variant">
                          {row.brandName || '—'}
                        </td>
                        <td className="px-4 text-table-cell">
                          {!row.firstBarcodeCode ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                              <AlertCircle className="size-3" /> Missing
                            </span>
                          ) : isAuto ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                              <Sparkles className="size-3" /> Auto (Option A)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                              <Layers className="size-3" /> Manufacturer (Option B)
                            </span>
                          )}
                        </td>
                        <td className="px-4 text-table-cell text-right tabular-nums font-mono font-bold text-on-surface">
                          {row.totalBarcodes}
                        </td>
                        <td className="px-4 text-table-cell text-right tabular-nums font-mono font-bold text-success">
                          {row.totalQtyOnHand}
                        </td>
                        <td className="px-4 text-table-cell text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant={isExpanded ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => setExpandedBatchId(isExpanded ? null : row.batchId)}
                            >
                              <span>{isExpanded ? 'Hide' : 'View Barcodes'}</span>
                              {isExpanded ? <ChevronUp className="size-4 ml-1" /> : <ChevronDown className="size-4 ml-1" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPrintBatch(row)}
                              title="Print Batch Labels"
                            >
                              <Printer className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deleteBatch.isPending}
                              onClick={() => handleDeleteBatch(row)}
                              className="text-on-surface-variant hover:text-error hover:bg-error/10"
                              title="Delete Batch"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-on-surface/[0.02] hairline-b">
                          <td colSpan={9} className="p-0">
                            <BatchBarcodesSubTable productId={row.productId} batchCode={row.batchCode} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Paging Controls */}
        {!isPending && rows.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-border/40 text-body-sm text-on-surface-variant">
            <span>
              Page {safePage + 1} of {pageCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-4 mr-1" /> Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
