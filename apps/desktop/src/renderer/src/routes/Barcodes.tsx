import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Barcode,
  Printer,
  Sparkles,
  Layers,
  Search,
  Check,
  Copy,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  ListOrdered,
  PackageCheck,
  AlertCircle
} from 'lucide-react'
import { BarcodeCanvasA4, type BarcodeLabelData } from '@/components/barcode/BarcodeCanvasA4'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useCategories } from '@/hooks/useProductLookups'
import { PRODUCT_LIMIT, useProducts, type ProductListItem } from '@/hooks/useProducts'
import { generateCode128Svg } from '@/lib/code128'
import {
  BARCODE_FORMAT_OPTIONS,
  generateCustomBarcodeSequence,
  type BarcodeFormatId
} from '@/lib/sequence'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const PAGE_SIZE = 25

type SortId = 'name-asc' | 'barcode-asc' | 'category-asc' | 'type-asc'

const SORT_OPTIONS: SelectOption[] = [
  { value: 'name-asc', label: 'Name — A to Z' },
  { value: 'barcode-asc', label: 'Barcode' },
  { value: 'category-asc', label: 'Category' },
  { value: 'type-asc', label: 'Barcode Type' }
]

const TYPE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All barcode types' },
  { value: 'auto', label: 'Auto-generated (Option A)' },
  { value: 'manufacturer', label: 'Manufacturer (Option B)' },
  { value: 'missing', label: 'Missing barcode' }
]

const COMPARATORS: Record<SortId, (a: ProductListItem, b: ProductListItem) => number> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'barcode-asc': (a, b) => (a.skuBarcode || '').localeCompare(b.skuBarcode || ''),
  'category-asc': (a, b) => (a.categoryName || '').localeCompare(b.categoryName || ''),
  'type-asc': (a, b) => (a.skuBarcode ? (a.skuBarcode.startsWith('ST') ? 1 : 2) : 3) - (b.skuBarcode ? (b.skuBarcode.startsWith('ST') ? 1 : 2) : 3)
}

interface BatchRecord {
  id: string
  batchCode: string
  productId: string
  productName: string
  quantity: number
  formatId: BarcodeFormatId
  startBarcode: string
  endBarcode: string
  createdAt: string
  barcodes: string[]
}

export function Barcodes() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isPending, error: fetchError } = useProducts()
  const { data: categories } = useCategories()
  const products: ProductListItem[] = data?.items ?? []

  // Main Page Filters & Paging (Matching Products.tsx)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sort, setSort] = useState<SortId>('name-asc')
  const [page, setPage] = useState(0)

  // Drawer / Generator Modal State
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(10)
  const [batchCode, setBatchCode] = useState<string>(() => {
    const d = new Date()
    const yymmdd = [
      String(d.getFullYear()).slice(2),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('')
    return `BATCH-${yymmdd}-001`
  })

  // Barcode Mode State
  const [mode, setMode] = useState<'A' | 'B'>('A')
  const [selectedFormatId, setSelectedFormatId] = useState<BarcodeFormatId>('SKU_DATE_SEQ')
  const [customPrefix, setCustomPrefix] = useState<string>('SIDD')
  const [customManufacturerBarcode, setCustomManufacturerBarcode] = useState<string>('')
  const [startSeq, setStartSeq] = useState<number>(1)

  // Local saved batch history
  const [batchHistory, setBatchHistory] = useState<BatchRecord[]>([])

  // Status & Print Canvas state
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [printItems, setPrintItems] = useState<BarcodeLabelData[] | null>(null)

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

  // Filtered & Sorted Products for main table
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()

    return products
      .filter((product) => {
        if (categoryId !== '' && product.categoryId !== categoryId) return false
        
        if (typeFilter === 'auto' && (!product.skuBarcode || (!product.skuBarcode.startsWith('ST') && !product.skuBarcode.includes('-')))) {
          return false
        }
        if (typeFilter === 'manufacturer' && (!product.skuBarcode || product.skuBarcode.startsWith('ST') || product.skuBarcode.includes('-'))) {
          return false
        }
        if (typeFilter === 'missing' && product.skuBarcode) {
          return false
        }

        if (term === '') return true
        const haystack = [
          product.name,
          product.skuBarcode,
          product.categoryName,
          product.brandName,
          product.modelNumber
        ]
        return haystack.some((v) => v !== null && v.toLowerCase().includes(term))
      })
      .sort(COMPARATORS[sort])
  }, [products, search, categoryId, typeFilter, sort])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function changeFilter(apply: () => void) {
    apply()
    setPage(0)
  }

  // Selected Product for Generator
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0] || null,
    [products, selectedProductId]
  )

  // Format option metadata
  const currentFormatOption = useMemo(
    () => BARCODE_FORMAT_OPTIONS.find((f) => f.id === selectedFormatId) || BARCODE_FORMAT_OPTIONS[0],
    [selectedFormatId]
  )

  // Generated Barcode Sequence list
  const generatedSequence: string[] = useMemo(() => {
    if (mode === 'B') {
      const bCode = customManufacturerBarcode.trim() || selectedProduct?.skuBarcode || '8901234567890'
      return Array(Math.max(1, quantity)).fill(bCode)
    }

    return generateCustomBarcodeSequence(selectedFormatId, startSeq, quantity, {
      skuCode: selectedProduct?.name ? selectedProduct.name.slice(0, 4) : 'PROD',
      categoryName: selectedProduct?.categoryName || 'GEN',
      customPrefix,
      date: new Date()
    })
  }, [mode, selectedFormatId, startSeq, quantity, selectedProduct, customManufacturerBarcode, customPrefix])

  // Active preview barcode
  const previewBarcode = generatedSequence[0] || 'ST00000001'

  // SVG for preview
  const barcodeSvg = useMemo(() => {
    try {
      return generateCode128Svg(previewBarcode, { height: 50, includeText: true })
    } catch {
      return null
    }
  }, [previewBarcode])

  const currentTimestampFormatted = useMemo(() => {
    return new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })
  }, [])

  // Save Barcode & Batch
  const handleSaveAndCreateBatch = async () => {
    if (!selectedProduct) return
    const primaryBarcode = generatedSequence[0]
    if (!primaryBarcode) return

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ sku_barcode: primaryBarcode })
        .eq('id', selectedProduct.id)

      if (updateError) throw updateError

      const newBatch: BatchRecord = {
        id: `batch_${Date.now()}`,
        batchCode: batchCode.trim() || `BATCH-${Date.now()}`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity,
        formatId: selectedFormatId,
        startBarcode: generatedSequence[0] || 'ST00000001',
        endBarcode: generatedSequence[generatedSequence.length - 1] || 'ST00000001',
        createdAt: new Date().toISOString(),
        barcodes: generatedSequence
      }

      setBatchHistory((prev) => [newBatch, ...prev])
      setStatusMessage({
        tone: 'success',
        text: `Successfully saved barcode ${primaryBarcode} to ${selectedProduct.name}!`
      })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (err: any) {
      setStatusMessage({
        tone: 'error',
        text: err?.message || 'Failed to save barcode.'
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Print Action for Current Generator Batch
  const handlePrintCurrentBatch = () => {
    if (!selectedProduct) return
    const items: BarcodeLabelData[] = generatedSequence.map((code) => ({
      barcode: code,
      productName: selectedProduct.name,
      categoryOrModel: selectedProduct.categoryName || undefined,
      brand: selectedProduct.brandName || undefined
    }))
    setPrintItems(items)
  }

  // Handle Print Single Product
  const handlePrintProduct = (prod: ProductListItem, qty: number = 24) => {
    const code = prod.skuBarcode || 'ST00000001'
    const items: BarcodeLabelData[] = Array(qty).fill({
      barcode: code,
      productName: prod.name,
      categoryOrModel: prod.categoryName || undefined,
      brand: prod.brandName || undefined
    })
    setPrintItems(items)
  }

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  // If in Print View
  if (printItems) {
    return <BarcodeCanvasA4 items={printItems} onBack={() => setPrintItems(null)} />
  }

  // Table Column Definitions
  const columns: Column<ProductListItem>[] = [
    {
      header: 'Barcode',
      cell: (row) => (
        <div className="flex items-center gap-2 font-mono text-body-sm font-semibold">
          <Barcode className="size-4 text-primary shrink-0" />
          {row.skuBarcode ? (
            <span
              onClick={() => {
                setSelectedProductId(row.id)
                setCustomManufacturerBarcode(row.skuBarcode || '')
                setIsGeneratorOpen(true)
              }}
              className="text-on-surface hover:text-primary cursor-pointer hover:underline"
              title="Click to view/generate barcode"
            >
              {row.skuBarcode}
            </span>
          ) : (
            <span
              onClick={() => {
                setSelectedProductId(row.id)
                setIsGeneratorOpen(true)
              }}
              className="text-on-surface-variant/40 italic hover:text-primary cursor-pointer hover:underline"
            >
              Unassigned (+ Generate)
            </span>
          )}
          {row.skuBarcode && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCopy(row.skuBarcode)
              }}
              className="p-1 hover:bg-surface-variant/40 rounded transition-colors text-on-surface-variant/60 hover:text-primary"
              title="Copy Barcode"
              type="button"
            >
              {copiedCode === row.skuBarcode ? (
                <Check className="size-3 text-success" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          )}
        </div>
      )
    },
    {
      header: 'Product',
      cell: (row) => (
        <div>
          <div className="font-semibold text-on-surface text-body-sm">{row.name}</div>
          <div className="text-[11px] text-on-surface-variant/60">{row.skuBarcode || 'No SKU'}</div>
        </div>
      )
    },
    {
      header: 'Category',
      cell: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-variant/40 text-on-surface-variant">
          {row.categoryName || 'General'}
        </span>
      )
    },
    {
      header: 'Brand',
      cell: (row) => (
        <span className="text-body-sm text-on-surface-variant">{row.brandName || '—'}</span>
      )
    },
    {
      header: 'Barcode Type',
      cell: (row) => {
        if (!row.skuBarcode) {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
              <AlertCircle className="size-3" /> Missing
            </span>
          )
        }
        return row.skuBarcode.startsWith('ST') || row.skuBarcode.includes('-') ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3" /> Auto (Option A)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <Layers className="size-3" /> Manufacturer (Option B)
          </span>
        )
      }
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void navigate(`/barcodes/${row.id}/generate`)}
          >
            Generate Barcode
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePrintProduct(row, 24)}
            title="Print Barcode Sheet"
          >
            <Printer className="size-4" />
          </Button>
        </div>
      )
    }
  ]

  return (
    <div className="flex flex-col gap-gutter">
      {/* PAGE HEADER - Matching Products.tsx */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-on-surface">Product Barcode Registry</h1>
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
          onClick={() => void navigate('/barcodes/generate')}
        >
          Generate barcode
        </Button>
      </div>

      {fetchError && (
        <Alert tone="error">
          {(fetchError as Error).message}
        </Alert>
      )}

      {/* PRODUCT BARCODE REGISTRY CARD - Matching Products.tsx layout */}
      <Card>
        {/* Hairline-b Filter Strip */}
        <div className="flex items-end gap-3 hairline-b p-4">
          <div className="flex flex-1 flex-col">
            <label
              className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant"
              htmlFor="barcode-search"
            >
              Search
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
                strokeWidth={1.5}
              />
              <input
                className="h-10 w-full rounded-xl border border-border bg-surface-container-lowest/50 pl-9 pr-4 text-on-surface transition-all placeholder:text-outline focus:border-primary-container"
                id="barcode-search"
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
            onChange={(val) => changeFilter(() => setCategoryId(val))}
            options={categoryOptions}
            value={categoryId}
          />

          <Select
            containerClassName="w-52"
            label="Barcode Type"
            onChange={(val) => changeFilter(() => setTypeFilter(val))}
            options={TYPE_OPTIONS}
            value={typeFilter}
          />

          <Select
            containerClassName="w-52"
            label="Sort by"
            onChange={(val) => changeFilter(() => setSort(val as SortId))}
            options={SORT_OPTIONS}
            value={sort}
          />
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isPending}
          emptyMessage="No matching product barcodes found."
          getRowId={(row) => row.id}
        />

        {/* Table Paging Controls */}
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
      </Card>

      {/* GENERATE BARCODE SLIDE-OVER DRAWER / MODAL ON THE RIGHT */}
      {isGeneratorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl h-full bg-surface border-l border-border shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-surface-variant/20 sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary-container/20 text-primary rounded-xl">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h2 className="text-h3 font-bold text-on-surface">Generate Product Barcode</h2>
                  <p className="text-body-sm text-on-surface-variant/70">
                    {selectedProduct ? selectedProduct.name : 'Select a product to configure'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGeneratorOpen(false)}
                className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/40 rounded-xl transition-colors"
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* STEP 1: Target Product */}
              <div className="space-y-1.5">
                <label className="block text-body-sm font-bold text-on-surface">
                  1. Target Product
                </label>
                <select
                  value={selectedProductId || selectedProduct?.id || ''}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value)
                    const prod = products.find((p) => p.id === e.target.value)
                    if (prod?.skuBarcode) setCustomManufacturerBarcode(prod.skuBarcode)
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-on-surface text-body-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.skuBarcode ? `(${p.skuBarcode})` : '(No Barcode)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* STEP 2: Quantity Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-body-sm font-bold text-on-surface">
                    2. Product Quantity (Barcodes to Generate)
                  </label>
                  <span className="px-2 py-0.5 text-xs font-bold text-primary bg-primary-container/20 rounded-md">
                    {quantity} Units
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-28 h-10 px-3 rounded-lg border border-border bg-surface text-on-surface text-body-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                </div>
              </div>

              {/* STEP 3: Batch Code & Timestamp */}
              <div className="space-y-2 p-3.5 rounded-xl bg-surface-variant/30 border border-border/50">
                <label className="block text-body-sm font-bold text-on-surface">
                  3. Batch Code & Timestamp
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] font-medium text-on-surface-variant mb-1 block">Batch Code</span>
                    <input
                      type="text"
                      value={batchCode}
                      onChange={(e) => setBatchCode(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-body-sm font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-on-surface-variant mb-1 block">Creation Timestamp</span>
                    <div className="h-9 px-3 flex items-center gap-2 rounded-lg bg-surface border border-border/60 text-xs font-mono text-on-surface-variant">
                      <Clock className="size-3.5 text-primary shrink-0" />
                      {currentTimestampFormatted}
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 4: Barcode Mode */}
              <div className="space-y-3">
                <label className="block text-body-sm font-bold text-on-surface">
                  4. Barcode Mode
                </label>
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface-variant/30 rounded-xl border border-border/60">
                  <button
                    type="button"
                    onClick={() => setMode('A')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 text-body-sm font-bold rounded-lg transition-all ${
                      mode === 'A'
                        ? 'bg-surface text-primary shadow-sm border border-border/60'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Sparkles className="size-4 text-primary" />
                    Option A: Auto-Generated
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('B')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 text-body-sm font-bold rounded-lg transition-all ${
                      mode === 'B'
                        ? 'bg-surface text-emerald-600 shadow-sm border border-border/60'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Layers className="size-4 text-emerald-500" />
                    Option B: Manufacturer Code
                  </button>
                </div>
              </div>

              {/* Option A Format Selection & Diagram */}
              {mode === 'A' ? (
                <div className="space-y-4 p-4 rounded-xl bg-primary-container/5 border border-primary-container/20">
                  <div>
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">
                      Barcode Format Pattern
                    </label>
                    <select
                      value={selectedFormatId}
                      onChange={(e) => setSelectedFormatId(e.target.value as BarcodeFormatId)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-on-surface text-body-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {BARCODE_FORMAT_OPTIONS.map((fmt) => (
                        <option key={fmt.id} value={fmt.id}>
                          {fmt.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedFormatId === 'CUSTOM_PREFIX' && (
                    <Field
                      label="Custom Prefix"
                      value={customPrefix}
                      onChange={(e) => setCustomPrefix(e.target.value)}
                      placeholder="e.g. SIDD"
                    />
                  )}

                  {/* Format Structure Breakdown Diagram */}
                  <div className="p-3.5 bg-surface rounded-xl border border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <Info className="size-3.5 text-primary" />
                        Structure Breakdown:
                      </span>
                      <span className="text-[11px] font-mono text-on-surface-variant">
                        {currentFormatOption?.patternDescription || ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {(currentFormatOption?.parts || []).map((part, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${part.color}`}
                          title={part.description}
                        >
                          <span>{part.label}</span>
                          <span className="text-[10px] font-normal opacity-80">({part.description})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface-variant/20 border border-border/60 space-y-3">
                  <Field
                    label="Manufacturer Barcode (Option B)"
                    hint="Scan or type existing barcode on physical package."
                    value={customManufacturerBarcode}
                    onChange={(e) => setCustomManufacturerBarcode(e.target.value)}
                    placeholder="e.g. 8901234567890"
                  />
                </div>
              )}

              {/* LIVE STICKER & SEQUENCE REVIEW */}
              <div className="space-y-3 pt-2">
                <div className="p-4 bg-white rounded-xl border border-slate-300 shadow-sm flex flex-col items-center justify-center space-y-2 text-center">
                  <div className="text-slate-500 font-medium text-xs uppercase tracking-wider">
                    {selectedProduct?.brandName || 'SIDDESH ERP'}
                  </div>
                  <div className="text-slate-900 font-bold text-sm line-clamp-1">
                    {selectedProduct?.name || 'Sample Product'}
                  </div>
                  {barcodeSvg ? (
                    <div className="py-1" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                  ) : (
                    <div className="py-2 text-slate-400 italic text-xs">Invalid barcode preview</div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-on-surface">
                    <span className="flex items-center gap-1.5">
                      <ListOrdered className="size-3.5 text-primary" />
                      Generated Sequence Review ({generatedSequence.length} Units)
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-surface-variant/30 rounded-xl border border-border/60 font-mono text-xs">
                    {generatedSequence.map((code, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-1 rounded bg-surface text-on-surface"
                      >
                        <span className="text-on-surface-variant/60 font-sans text-[11px]">Unit #{idx + 1}</span>
                        <span className="font-bold text-primary">{code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {statusMessage && (
                <Alert tone={statusMessage.tone}>
                  {statusMessage.text}
                </Alert>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-6 border-t border-border/50 bg-surface-variant/20 flex items-center gap-3 sticky bottom-0 z-10 backdrop-blur-md">
              <Button
                variant="primary"
                onClick={handleSaveAndCreateBatch}
                isLoading={isSaving}
                className="flex-1"
              >
                Save & Link Barcode
              </Button>
              <Button variant="secondary" onClick={handlePrintCurrentBatch}>
                <Printer className="size-4 mr-2" />
                Print Labels ({quantity})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
