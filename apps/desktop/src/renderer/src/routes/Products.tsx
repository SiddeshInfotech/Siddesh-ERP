import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useCategories } from '@/hooks/useProductLookups'
import { PRODUCT_LIMIT, useProducts, type ProductListItem } from '@/hooks/useProducts'
import { cn } from '@/lib/cn'
import { toUserMessage } from '@/lib/errors'

/**
 * Product master list (DSK-201, DSK-202, DSK-203, DSK-216, DSK-220).
 *
 * Search, filter, sort and paging all run on the already-fetched list — see `useProducts` for
 * why the whole master is loaded once. That is what lets "sort by stock" be correct: stock
 * lives in another table, so no server-side ORDER BY can reach it.
 */

const PAGE_SIZE = 25

type SortId = 'name-asc' | 'name-desc' | 'stock-asc' | 'stock-desc' | 'barcode-asc'

const SORT_OPTIONS: SelectOption[] = [
  { value: 'name-asc', label: 'Name — A to Z' },
  { value: 'name-desc', label: 'Name — Z to A' },
  { value: 'stock-asc', label: 'Stock — lowest first' },
  { value: 'stock-desc', label: 'Stock — highest first' },
  { value: 'barcode-asc', label: 'Barcode' }
]

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'active', label: 'Active only' },
  { value: 'all', label: 'Active and inactive' },
  { value: 'inactive', label: 'Inactive only' }
]

const COMPARATORS: Record<SortId, (a: ProductListItem, b: ProductListItem) => number> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'stock-asc': (a, b) => a.qtyAvailable - b.qtyAvailable || a.name.localeCompare(b.name),
  'stock-desc': (a, b) => b.qtyAvailable - a.qtyAvailable || a.name.localeCompare(b.name),
  'barcode-asc': (a, b) => a.skuBarcode.localeCompare(b.skuBarcode)
}

/** Matches the search box against everything a storekeeper might have in hand (SRD §10). */
function matchesSearch(product: ProductListItem, term: string): boolean {
  if (term === '') return true

  const haystack = [
    product.name,
    product.skuBarcode,
    product.categoryName,
    product.brandName,
    product.modelNumber
  ]

  return haystack.some((value) => value !== null && value.toLowerCase().includes(term))
}

export function Products() {
  const navigate = useNavigate()
  const { data, isPending, error, refetch } = useProducts()
  const { data: categories } = useCategories()

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('active')
  const [sort, setSort] = useState<SortId>('name-asc')
  const [page, setPage] = useState(0)

  const visible = useMemo(() => {
    const items = data?.items ?? []
    const term = search.trim().toLowerCase()

    return items
      .filter((product) => {
        if (status === 'active' && !product.isActive) return false
        if (status === 'inactive' && product.isActive) return false
        if (categoryId !== '' && product.categoryId !== categoryId) return false
        return matchesSearch(product, term)
      })
      .sort(COMPARATORS[sort])
  }, [data, search, categoryId, status, sort])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  // Filtering can strand the user past the end of a now-shorter list; clamp rather than
  // showing a blank page that looks broken.
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  /** Any filter change invalidates the current page number. */
  function changeFilter(apply: () => void) {
    apply()
    setPage(0)
  }

  const columns: Column<ProductListItem>[] = [
    {
      id: 'barcode',
      header: 'Barcode',
      width: 'w-36',
      cell: (product) => (
        <span className="font-mono text-mono-id text-on-surface-variant">{product.skuBarcode}</span>
      )
    },
    {
      id: 'name',
      header: 'Product',
      cell: (product) => (
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{product.name}</span>
          {product.modelNumber === null ? null : (
            <span className="text-body-sm text-on-surface-variant/60">{product.modelNumber}</span>
          )}
        </div>
      )
    },
    {
      id: 'category',
      header: 'Category',
      width: 'w-40',
      cell: (product) => (
        <span className="text-on-surface-variant">{product.categoryName ?? '—'}</span>
      )
    },
    {
      id: 'brand',
      header: 'Brand',
      width: 'w-32',
      cell: (product) => <span className="text-on-surface-variant">{product.brandName ?? '—'}</span>
    },
    {
      id: 'stock',
      header: 'Stock',
      align: 'right',
      width: 'w-24',
      cell: (product) => (
        <span
          className={cn(
            'font-semibold tabular-nums',
            // Colour is never the only signal — the Min column carries the same fact as a
            // number, so a colour-blind user is not relying on the amber.
            product.isLowStock ? 'text-tertiary' : 'text-on-surface'
          )}
        >
          {product.qtyAvailable}
          {product.uomCode === null ? null : (
            <span className="ml-1 text-body-sm font-normal text-on-surface-variant/60">
              {product.uomCode}
            </span>
          )}
        </span>
      )
    },
    {
      id: 'min',
      header: 'Min',
      align: 'right',
      width: 'w-20',
      cell: (product) => (
        <span className="tabular-nums text-on-surface-variant/70">{product.minStock}</span>
      )
    },
    {
      id: 'status',
      header: 'Status',
      width: 'w-24',
      cell: (product) =>
        product.isActive ? (
          <span className="text-body-sm text-on-surface-variant/60">Active</span>
        ) : (
          <span className="rounded-full bg-surface-variant/40 px-2 py-0.5 text-body-sm text-on-surface-variant">
            Inactive
          </span>
        )
    }
  ]

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Products</h1>
          <p className="text-body-sm text-on-surface-variant/60">
            {isPending
              ? 'Loading…'
              : `${visible.length} of ${data?.totalCount ?? 0} ${
                  (data?.totalCount ?? 0) === 1 ? 'product' : 'products'
                }`}
          </p>
        </div>

        <Button
          icon={<Plus aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
          onClick={() => void navigate('/products/new')}
        >
          New product
        </Button>
      </div>

      {data?.isTruncated ? (
        <Alert tone="warning">
          Showing the first {PRODUCT_LIMIT} products. Use search to narrow the list.
        </Alert>
      ) : null}

      <Card>
        <div className="flex items-end gap-3 hairline-b p-4">
          <div className="flex flex-1 flex-col">
            <label
              className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
              htmlFor="product-search"
            >
              Search
            </label>
            {/* The icon is positioned against the input alone, not the label + input stack —
                otherwise its offset silently depends on the label's line height. */}
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
                strokeWidth={1.5}
              />
              <input
                className="h-10 w-full rounded-xl border border-border bg-surface-container-lowest/50 pl-9 pr-4 text-on-surface transition-all placeholder:text-outline focus:border-primary-container"
                id="product-search"
                onChange={(event) => changeFilter(() => setSearch(event.target.value))}
                placeholder="Name, barcode, category, brand or model"
                type="search"
                value={search}
              />
            </div>
          </div>

          <Select
            containerClassName="w-52"
            label="Category"
            onChange={(next) => changeFilter(() => setCategoryId(next))}
            options={categories ?? []}
            placeholder="All categories"
            value={categoryId}
          />

          <Select
            containerClassName="w-44"
            label="Status"
            onChange={(next) => changeFilter(() => setStatus(next))}
            options={STATUS_OPTIONS}
            value={status}
          />

          <Select
            containerClassName="w-52"
            label="Sort by"
            onChange={(next) => changeFilter(() => setSort(next as SortId))}
            options={SORT_OPTIONS}
            value={sort}
          />
        </div>

        <DataTable
          caption="Products, with current stock"
          columns={columns}
          emptyMessage={
            search !== '' || categoryId !== ''
              ? 'No products match these filters.'
              : 'No products yet. Add your first one.'
          }
          error={error === null ? undefined : toUserMessage(error)}
          getRowId={(product) => product.id}
          isLoading={isPending}
          onRetry={() => void refetch()}
          onRowClick={(product) => void navigate(`/products/${product.id}`)}
          rows={rows}
        />

        {pageCount > 1 ? (
          <div className="flex items-center justify-between hairline-t px-4 py-3">
            <p className="text-body-sm text-on-surface-variant/60">
              Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, visible.length)}{' '}
              of {visible.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={safePage === 0}
                icon={<ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                onClick={() => setPage(safePage - 1)}
                size="sm"
                variant="secondary"
              >
                Previous
              </Button>
              <span className="text-body-sm tabular-nums text-on-surface-variant">
                {safePage + 1} / {pageCount}
              </span>
              <Button
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                size="sm"
                variant="secondary"
              >
                Next
                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
