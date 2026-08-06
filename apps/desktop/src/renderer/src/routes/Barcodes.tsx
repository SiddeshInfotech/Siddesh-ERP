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
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react'
import { BarcodeCanvasA4, type BarcodeLabelData } from '@/components/barcode/BarcodeCanvasA4'
import { BatchBarcodesSubTable } from '@/components/barcode/BatchBarcodesSubTable'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SpinnerPane } from '@/components/ui/Spinner'
import { useAllBatches, type BatchRegistryRow } from '@/hooks/useAllBatches'
import { useBatchBarcodes, useDeleteBatch } from '@/hooks/useBatchBarcodes'
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
          <div className="flex flex-1 min-w-[240px] flex-col mb-1.5">
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
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Barcode Initial</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Product</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Batch Code</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Category</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Brand</th>
                  <th className="px-4 py-2.5 text-left text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Barcode Type</th>
                  <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Batch Qty</th>
                  <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">In Stock</th>
                  <th className="px-4 py-2.5 text-right text-label-caps uppercase text-on-surface-variant/70 whitespace-nowrap">Actions</th>
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
                        <td className="px-4 text-table-cell font-mono font-semibold text-primary whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Barcode className="size-4 text-primary shrink-0" />
                            <span>{row.firstBarcodeCode || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 text-table-cell whitespace-nowrap">
                          <div>
                            <div className="font-semibold text-on-surface text-body-sm">{row.productName}</div>
                            <div className="text-[11px] text-on-surface-variant/60">{row.skuBarcode || 'No SKU'}</div>
                          </div>
                        </td>
                        <td className="px-4 text-table-cell font-mono text-body-sm font-medium text-on-surface whitespace-nowrap">
                          {row.batchCode}
                        </td>
                        <td className="px-4 text-table-cell whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-variant/40 text-on-surface-variant">
                            {row.categoryName || 'General'}
                          </span>
                        </td>
                        <td className="px-4 text-table-cell text-body-sm text-on-surface-variant whitespace-nowrap">
                          {row.brandName || '—'}
                        </td>
                        <td className="px-4 text-table-cell whitespace-nowrap">
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
                        <td className="px-4 text-table-cell text-right tabular-nums font-mono font-bold text-on-surface whitespace-nowrap">
                          {row.totalBarcodes}
                        </td>
                        {/* Received-only: a batch counts as stock only once its barcodes flip
                            GENERATED → IN_STOCK/INWARDED. A generated-but-not-received batch is 0. */}
                        <td className="px-4 text-table-cell text-right whitespace-nowrap">
                          <div className="flex flex-col items-end leading-tight">
                            <span
                              className={cn(
                                'tabular-nums font-mono font-bold',
                                row.qtyInStock > 0 ? 'text-success' : 'text-on-surface-variant/50'
                              )}
                            >
                              {row.qtyInStock}
                            </span>
                            <span className="font-sans text-[10px] text-on-surface-variant/60 whitespace-nowrap">
                              Gen {row.qtyGenerated}
                              {row.qtyOutward > 0 ? ` · Out ${row.qtyOutward}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 text-table-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setExpandedBatchId(isExpanded ? null : row.batchId)}
                              title={isExpanded ? 'Hide Barcodes' : 'View Barcodes'}
                              className={cn(
                                "p-1 transition-colors",
                                isExpanded ? "text-primary" : "text-on-surface-variant hover:text-primary"
                              )}
                            >
                              {isExpanded ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintBatch(row)}
                              title="Print Batch Labels"
                              className="p-1 transition-colors text-on-surface-variant hover:text-on-surface"
                            >
                              <Printer className="size-4.5" />
                            </button>
                            <button
                              type="button"
                              disabled={deleteBatch.isPending}
                              onClick={() => handleDeleteBatch(row)}
                              title="Delete Batch"
                              className="p-1 transition-colors text-on-surface-variant hover:text-error disabled:opacity-50"
                            >
                              <Trash2 className="size-4.5" />
                            </button>
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
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 text-body-sm text-on-surface-variant">
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
