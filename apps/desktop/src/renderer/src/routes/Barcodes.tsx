import { useState, useMemo } from 'react'
import {
  Barcode,
  Printer,
  Sparkles,
  Layers,
  Search,
  Check,
  Copy,
  Tag,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { BarcodeCanvasA4, type BarcodeLabelData } from '@/components/barcode/BarcodeCanvasA4'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field } from '@/components/ui/Field'
import { useProducts, type ProductListItem } from '@/hooks/useProducts'
import { generateCode128Svg } from '@/lib/code128'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

export function Barcodes() {
  const queryClient = useQueryClient()
  const { data: productsData, isLoading, error: fetchError } = useProducts()
  const products: ProductListItem[] = productsData?.items ?? []

  const [searchQuery, setSearchQuery] = useState('')
  const [filterSource, setFilterSource] = useState<'all' | 'auto' | 'manufacturer' | 'missing'>('all')
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  
  // Barcode Generator Form State
  const [mode, setMode] = useState<'A' | 'B'>('A')
  const [customBarcode, setCustomBarcode] = useState('')
  const [printQuantity, setPrintQuantity] = useState<number>(24)
  
  // Saving & Status state
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  // Print canvas modal state
  const [printItems, setPrintItems] = useState<BarcodeLabelData[] | null>(null)

  // Selected Product object
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0] || null,
    [products, selectedProductId]
  )

  // Filtered Products for the table
  const filteredProducts = useMemo(() => {
    let result = products

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.skuBarcode && p.skuBarcode.toLowerCase().includes(q)) ||
          (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
          (p.brandName && p.brandName.toLowerCase().includes(q))
      )
    }

    if (filterSource === 'auto') {
      result = result.filter((p) => p.skuBarcode && p.skuBarcode.startsWith('ST'))
    } else if (filterSource === 'manufacturer') {
      result = result.filter((p) => p.skuBarcode && !p.skuBarcode.startsWith('ST'))
    } else if (filterSource === 'missing') {
      result = result.filter((p) => !p.skuBarcode)
    }

    return result
  }, [products, searchQuery, filterSource])

  // Suggested Option A Barcode
  const suggestedBarcode = useMemo(() => {
    if (selectedProduct?.skuBarcode && selectedProduct.skuBarcode.startsWith('ST')) {
      return selectedProduct.skuBarcode
    }
    // Calculate highest ST code in current products
    let maxNum = 0
    for (const p of products) {
      if (p.skuBarcode && p.skuBarcode.startsWith('ST')) {
        const num = parseInt(p.skuBarcode.slice(2), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    }
    return `ST${String(maxNum + 1).padStart(8, '0')}`
  }, [selectedProduct, products])

  // Active preview barcode
  const activeBarcode = mode === 'A' ? suggestedBarcode : customBarcode || selectedProduct?.skuBarcode || 'ST00000001'

  // SVG for the active preview
  const barcodeSvg = useMemo(() => {
    try {
      return generateCode128Svg(activeBarcode, { height: 50, includeText: true })
    } catch {
      return null
    }
  }, [activeBarcode])

  // Save Barcode to Database
  const handleSaveBarcode = async () => {
    if (!selectedProduct) return

    const codeToSave = mode === 'A' ? suggestedBarcode : customBarcode.trim()
    if (!codeToSave) {
      setStatusMessage({ tone: 'error', text: 'Please enter a valid barcode.' })
      return
    }

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ sku_barcode: codeToSave })
        .eq('id', selectedProduct.id)

      if (updateError) throw updateError

      setStatusMessage({
        tone: 'success',
        text: `Barcode ${codeToSave} successfully linked to ${selectedProduct.name}!`
      })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (err: any) {
      setStatusMessage({
        tone: 'error',
        text: err?.message || 'Failed to update barcode.'
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Print Action for Single Product
  const handlePrintProduct = (prod: ProductListItem, qty: number = 24) => {
    const code = prod.skuBarcode || suggestedBarcode
    const items: BarcodeLabelData[] = Array(qty).fill({
      barcode: code,
      productName: prod.name,
      categoryOrModel: prod.categoryName || undefined,
      brand: prod.brandName || undefined
    })
    setPrintItems(items)
  }

  // Handle Print Batch Barcodes
  const handlePrintBatch = () => {
    const items: BarcodeLabelData[] = []
    filteredProducts.slice(0, 50).forEach((p) => {
      const code = p.skuBarcode || 'ST00000001'
      items.push({
        barcode: code,
        productName: p.name,
        categoryOrModel: p.categoryName || undefined,
        brand: p.brandName || undefined
      })
    })
    setPrintItems(items)
  }

  // Copy to clipboard helper
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
            <span className="text-on-surface">{row.skuBarcode}</span>
          ) : (
            <span className="text-on-surface-variant/40 italic">Unassigned</span>
          )}
          {row.skuBarcode && (
            <button
              onClick={() => handleCopy(row.skuBarcode)}
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
        return row.skuBarcode.startsWith('ST') ? (
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
            onClick={() => {
              setSelectedProductId(row.id)
              setCustomBarcode(row.skuBarcode || '')
            }}
          >
            Manage
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold tracking-tight text-on-surface flex items-center gap-2.5">
            <Barcode className="size-7 text-primary" />
            Barcode Management
          </h1>
          <p className="text-body-md text-on-surface-variant">
            Generate, assign, and print physical product barcodes (Auto-generated ST-sequence or Manufacturer codes).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handlePrintBatch}>
            <Printer className="size-4 mr-2" />
            Print Batch Labels Sheet
          </Button>
        </div>
      </div>

      {fetchError && (
        <Alert tone="error">
          {(fetchError as Error).message}
        </Alert>
      )}

      {/* Main Studio & Barcode Generator Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Barcode Generator Form */}
        <Card className="lg:col-span-7 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-container/10 text-primary rounded-xl">
                <Tag className="size-5" />
              </div>
              <div>
                <h2 className="text-h3 font-bold text-on-surface">Barcode Generator Studio</h2>
                <p className="text-body-sm text-on-surface-variant">
                  Select a product and choose Option A (Software Auto-Generate) or Option B (Manufacturer Code).
                </p>
              </div>
            </div>
          </div>

          {/* Product Picker */}
          <div>
            <label className="block text-body-sm font-semibold text-on-surface mb-1.5">
              Target Product
            </label>
            <select
              value={selectedProductId || selectedProduct?.id || ''}
              onChange={(e) => {
                setSelectedProductId(e.target.value)
                const prod = products.find((p) => p.id === e.target.value)
                if (prod?.skuBarcode) setCustomBarcode(prod.skuBarcode)
              }}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-on-surface text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.skuBarcode ? `(${p.skuBarcode})` : '(No barcode)'}
                </option>
              ))}
            </select>
          </div>

          {/* Option A vs Option B Tabs */}
          <div className="space-y-2">
            <label className="block text-body-sm font-semibold text-on-surface">
              Barcode Mode
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
                Option A: Software Auto-Generated
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
                Option B: Manufacturer Barcode
              </button>
            </div>
          </div>

          {/* Mode Form Content */}
          {mode === 'A' ? (
            <div className="p-4 rounded-xl bg-primary-container/5 border border-primary-container/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-body-sm font-semibold text-on-surface">
                  Auto-Sequential Barcode (Option A)
                </span>
                <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-primary-container/20 text-primary">
                  {suggestedBarcode}
                </span>
              </div>
              <p className="text-body-sm text-on-surface-variant">
                Automatically assigns unique ST-code (e.g. ST00000001, ST00000002) for physical stock inventory tracking.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-surface-variant/20 border border-border/60 space-y-3">
              <Field
                label="Manufacturer Barcode (Option B)"
                hint="Scan or type existing product barcode available on physical package."
                value={customBarcode}
                onChange={(e) => setCustomBarcode(e.target.value)}
                placeholder="e.g. 8901234567890"
              />
            </div>
          )}

          {statusMessage && (
            <Alert tone={statusMessage.tone}>
              {statusMessage.text}
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleSaveBarcode}
              isLoading={isSaving}
              className="flex-1"
            >
              <CheckCircle2 className="size-4 mr-2" />
              Save Barcode to Product
            </Button>
            {selectedProduct && (
              <Button
                variant="secondary"
                onClick={() => handlePrintProduct(selectedProduct, printQuantity)}
              >
                <Printer className="size-4 mr-2" />
                Print Labels
              </Button>
            )}
          </div>
        </Card>

        {/* Right Column: Live SVG Barcode Label Preview */}
        <Card className="lg:col-span-5 p-6 flex flex-col justify-between space-y-6">
          <div>
            <h3 className="text-h3 font-bold text-on-surface mb-1">Live Label Preview</h3>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Real-time Code128 barcode rendering for physical print sticker.
            </p>

            {/* Label Card Box */}
            <div className="p-6 bg-white rounded-2xl border-2 border-dashed border-slate-300 shadow-sm flex flex-col items-center justify-center space-y-3 text-center">
              <div className="text-slate-500 font-medium text-xs uppercase tracking-wider">
                {selectedProduct?.brandName || 'SIDDESH ERP'}
              </div>
              <div className="text-slate-900 font-bold text-sm line-clamp-1">
                {selectedProduct?.name || 'Sample Product Name'}
              </div>
              <div className="text-slate-500 text-xs font-mono">
                {selectedProduct?.categoryName || 'General'}
              </div>

              {/* Rendered SVG Barcode */}
              {barcodeSvg ? (
                <div
                  className="py-2"
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                />
              ) : (
                <div className="py-6 text-slate-400 italic text-xs">Invalid barcode preview</div>
              )}
            </div>
          </div>

          {/* Print Sheet Config */}
          <div className="p-4 rounded-xl bg-surface-variant/30 border border-border/50 space-y-3">
            <div className="flex items-center justify-between text-body-sm font-semibold text-on-surface">
              <span>Print Sheet Quantity</span>
              <span className="text-primary font-bold">{printQuantity} labels</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={printQuantity}
              onChange={(e) => setPrintQuantity(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant/60 font-mono">
              <span>1 label</span>
              <span>24 (Std A4)</span>
              <span>48 labels</span>
              <span>100 labels</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Product Barcode Registry Table */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-h3 font-bold text-on-surface">Product Barcode Registry</h2>
            <p className="text-body-sm text-on-surface-variant">
              Showing {filteredProducts.length} of {products.length} registered products.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-on-surface-variant/60" />
              <input
                type="text"
                placeholder="Search products or barcodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Filter Dropdown */}
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as any)}
              className="h-9 px-3 rounded-lg border border-border bg-surface text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">All Barcode Types</option>
              <option value="auto">Option A (Auto ST-Code)</option>
              <option value="manufacturer">Option B (Manufacturer)</option>
              <option value="missing">Missing Barcode</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredProducts}
          isLoading={isLoading}
          emptyMessage="No matching products found."
          getRowId={(row) => row.id}
        />
      </Card>
    </div>
  )
}
