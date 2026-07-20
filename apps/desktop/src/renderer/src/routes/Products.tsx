<<<<<<< Updated upstream
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
=======
import { useState, useMemo } from 'react'
import { Plus, Search, Filter, Printer, Package, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { BarcodeGeneratorModal, ProductOption } from '@/components/barcode/BarcodeGeneratorModal'
import { formatBarcodeNumber } from '@/lib/sequence'

// Mock Seed Data for initial UI rendering & demonstration
const SAMPLE_PRODUCTS: ProductOption[] = [
  {
    id: 'prod-001',
    name: 'Arduino UNO R3 Board',
    sku_barcode: 'ST00000001',
    category: 'AI Lab',
    brand: 'Arduino'
  },
  {
    id: 'prod-002',
    name: 'Servo Motor SG90',
    sku_barcode: 'ST00000002',
    category: 'AI Lab',
    brand: 'TowerPro'
  },
  {
    id: 'prod-003',
    name: 'RFID RC522 Module',
    sku_barcode: 'ST00000003',
    category: 'AI Lab',
    brand: 'Siddesh'
  },
  {
    id: 'prod-004',
    name: '64 GB Pen Drive (Std 1-4 Marathi v2.3)',
    sku_barcode: 'ST00000004',
    category: 'Digital Products',
    brand: 'SanDisk'
  },
  {
    id: 'prod-005',
    name: '128 GB Pen Drive (Std 5-8 Science v1.0)',
    sku_barcode: 'ST00000005',
    category: 'Digital Products',
    brand: 'SanDisk'
  },
  {
    id: 'prod-006',
    name: 'USB Optical Mouse',
    sku_barcode: '8901234567890', // Manufacturer Barcode (Option B example)
    category: 'Office Items',
    brand: 'Logitech'
  }
]

export function Products() {
  const [products, setProducts] = useState<ProductOption[]>(SAMPLE_PRODUCTS)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [selectedProductForPrint, setSelectedProductForPrint] = useState<ProductOption | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false)

  // New Product Form State
  const [newProductName, setNewProductName] = useState<string>('')
  const [newCategory, setNewCategory] = useState<string>('AI Lab')
  const [newBrand, setNewBrand] = useState<string>('')
  const [barcodeOptionMode, setBarcodeOptionMode] = useState<'A' | 'B'>('A')
  const [customBarcode, setCustomBarcode] = useState<string>('')

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku_barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, categoryFilter])

  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProductName.trim()) return

    const nextSeq = products.length + 1
    const barcode =
      barcodeOptionMode === 'A'
        ? formatBarcodeNumber(nextSeq)
        : customBarcode.trim() || formatBarcodeNumber(nextSeq)

    const newProd: ProductOption = {
      id: `prod-${Date.now()}`,
      name: newProductName.trim(),
      sku_barcode: barcode,
      category: newCategory,
      brand: newBrand.trim() || undefined
    }

    setProducts([newProd, ...products])
    setIsAddModalOpen(false)

    // Reset Form
    setNewProductName('')
    setNewBrand('')
    setCustomBarcode('')
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600" />
            Product Master
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage product catalog, barcode assignments (Option A & B), and label printing.
>>>>>>> Stashed changes
          </p>
        </div>

        <Button
<<<<<<< Updated upstream
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
=======
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm px-4 py-2.5"
        >
          <Plus className="w-4 h-4" />
          Add New Product
        </Button>
      </div>

      {/* Filter and Search Section */}
      <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product, barcode, brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <option value="AI Lab">AI Lab</option>
              <option value="Digital Products">Digital Products</option>
              <option value="Office Items">Office Items</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Products Data Table */}
      <Card className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <DataTable
          columns={[
            {
              id: 'barcode',
              header: 'SKU Barcode',
              cell: (row) => (
                <div className="flex items-center gap-2 font-mono font-bold text-xs text-indigo-700 bg-indigo-50/60 px-2.5 py-1 rounded-md border border-indigo-100/80 w-fit">
                  {row.sku_barcode}
                </div>
              )
            },
            {
              id: 'name',
              header: 'Product Name',
              cell: (row) => <span className="font-semibold text-slate-900 text-xs">{row.name}</span>
            },
            {
              id: 'category',
              header: 'Category',
              cell: (row) => (
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                  {row.category || 'General'}
                </span>
              )
            },
            {
              id: 'brand',
              header: 'Brand',
              cell: (row) => <span className="text-xs text-slate-500">{row.brand || '—'}</span>
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: (row) => (
                <button
                  onClick={() => setSelectedProductForPrint(row)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 font-semibold text-xs rounded-lg border border-slate-200 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Barcodes
                </button>
              )
            }
          ]}
          rows={filteredProducts}
          getRowId={(row) => row.id}
          emptyMessage="No products found matching your search."
        />
      </Card>

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Add New Product</h3>
              <p className="text-xs text-slate-500">
                Create a product entry with Option A or Option B barcode assignment.
              </p>
            </div>

            <form onSubmit={handleAddProductSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Ultrasonic Sensor HC-SR04"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="AI Lab">AI Lab</option>
                    <option value="Digital Products">Digital Products</option>
                    <option value="Office Items">Office Items</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="e.g. Siddesh"
                    className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Barcode Option Toggle */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Barcode Mode
                </label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="barcodeMode"
                      checked={barcodeOptionMode === 'A'}
                      onChange={() => setBarcodeOptionMode('A')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Option A (Auto-Generate ST Sequence)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="barcodeMode"
                      checked={barcodeOptionMode === 'B'}
                      onChange={() => setBarcodeOptionMode('B')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Option B (Manufacturer Barcode)
                  </label>
                </div>

                {barcodeOptionMode === 'A' ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
                    Auto-generated SKU barcode will be:{' '}
                    <strong className="font-mono font-bold text-indigo-700">
                      {formatBarcodeNumber(products.length + 1)}
                    </strong>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={customBarcode}
                      onChange={(e) => setCustomBarcode(e.target.value)}
                      placeholder="Paste manufacturer barcode string..."
                      className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-5 py-2">
                  Save Product
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Generator & Printing Modal */}
      {selectedProductForPrint && (
        <BarcodeGeneratorModal
          product={selectedProductForPrint}
          onClose={() => setSelectedProductForPrint(null)}
        />
      )}
>>>>>>> Stashed changes
    </div>
  )
}
