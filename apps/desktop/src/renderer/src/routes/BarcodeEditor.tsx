import { useState, useMemo } from 'react'
import {
  Barcode,
  ChevronRight,
  Printer,
  Sparkles,
  Layers,
  CheckCircle2,
  Info,
  ListOrdered
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BarcodeCanvasA4, type BarcodeLabelData } from '@/components/barcode/BarcodeCanvasA4'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SpinnerPane } from '@/components/ui/Spinner'
import { useProducts, type ProductListItem } from '@/hooks/useProducts'
import { useBatches, useLastBarcode } from '@/hooks/useBatches'
import { generateCode128Svg } from '@/lib/code128'
import { toUserMessage } from '@/lib/errors'
import {
  BARCODE_FORMAT_OPTIONS,
  generateCustomBarcodeSequence,
  generateNextBatchCode,
  type BarcodeFormatId
} from '@/lib/sequence'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

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

export function BarcodeEditor() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: productsData, isPending, error: loadError } = useProducts()
  const products: ProductListItem[] = productsData?.items ?? []

  // Flow State
  const [selectedProductId, setSelectedProductId] = useState<string>(id || '')
  const [quantity, setQuantity] = useState<number>(10)
  const [batchCode, setBatchCode] = useState<string>('')
  const [createNewBatch, setCreateNewBatch] = useState<boolean>(true)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')

  // Barcode Mode State
  const [mode, setMode] = useState<'A' | 'B'>('A')
  const [selectedFormatId, setSelectedFormatId] = useState<BarcodeFormatId>('SKU_DATE_SEQ')
  const [customPrefix, setCustomPrefix] = useState<string>('SIDD')
  const [customManufacturerBarcode, setCustomManufacturerBarcode] = useState<string>('')
  const [startSeq, setStartSeq] = useState<number>(1)
  const [showInfo, setShowInfo] = useState<boolean>(false)

  // Selected Target Product
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === (selectedProductId || id)) || products[0] || null,
    [products, selectedProductId, id]
  )

  const { data: batches } = useBatches(selectedProduct?.id || null)
  const { data: lastBarcode } = useLastBarcode(
    selectedProduct?.id || null,
    createNewBatch ? null : (selectedBatchId || null)
  )

  // Auto-generate/suggest batch code based on batches
  useEffect(() => {
    if (batches && batches.length > 0) {
      const latestBatch = batches[0]
      if (latestBatch?.code) {
        setBatchCode(generateNextBatchCode(latestBatch.code))
        setSelectedBatchId(latestBatch.id)
        return
      }
    }

    const d = new Date()
    const yymmdd = [
      String(d.getFullYear()).slice(2),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('')
    setBatchCode(`BATCH-${yymmdd}-001`)
    setSelectedBatchId('')
  }, [batches])

  // Auto-guess next barcode sequence based on lastBarcode
  useEffect(() => {
    if (lastBarcode?.code) {
      const match = lastBarcode.code.match(/(\d+)$/)
      if (match) {
        setStartSeq(parseInt(match[1] || '0', 10) + 1)
      }
    } else {
      setStartSeq(1)
    }
  }, [lastBarcode])

  // Status & Print Canvas State
  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [printItems, setPrintItems] = useState<BarcodeLabelData[] | null>(null)

  // Product select options
  const productOptions: SelectOption[] = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: `${p.name} ${p.skuBarcode ? `(${p.skuBarcode})` : '(No barcode)'}`
    }))
  }, [products])

  const formatSelectOptions: SelectOption[] = useMemo(() => {
    return BARCODE_FORMAT_OPTIONS.map((fmt) => ({
      value: fmt.id,
      label: fmt.name,
      description: fmt.patternDescription
    }))
  }, [])

  const batchOptions: SelectOption[] = useMemo(() => {
    if (!batches || batches.length === 0) return []
    return batches.map((b, index) => ({
      value: b.id,
      label: index === 0 ? `🟢 ${b.code || 'Unknown'} (Latest)` : (b.code || 'Unknown'),
      description: `Created: ${new Date(b.created_at).toLocaleDateString()}`
    }))
  }, [batches])

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

  // Preview barcode
  const previewBarcode = generatedSequence[0] || 'ST00000001'

  // SVG for preview
  const barcodeSvg = useMemo(() => {
    try {
      return generateCode128Svg(previewBarcode, { height: 50, includeText: true })
    } catch {
      return null
    }
  }, [previewBarcode])

  // Save Barcode & Return to /barcodes (Backend records timestamp automatically)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return
    const primaryBarcode = generatedSequence[0]
    if (!primaryBarcode) return

    setIsSaving(true)
    setSubmitError(null)

    try {
      let resolvedBatchId: string | null = null

      if (createNewBatch) {
        if (!batchCode.trim()) {
          throw new Error('Batch code is required when creating a new batch.')
        }
        // Insert new batch
        const { data: newBatch, error: batchError } = await supabase
          .from('product_batches')
          .insert({
            product_id: selectedProduct.id,
            code: batchCode.trim()
          })
          .select()
          .single()

        if (batchError) throw batchError
        resolvedBatchId = newBatch.id
      } else {
        resolvedBatchId = selectedBatchId || null
      }

      // Insert all generated barcodes (deduplicated to prevent duplicate key errors in Option B mode)
      const uniqueBarcodes = Array.from(new Set(generatedSequence))
      const { error: barcodesError } = await supabase
        .from('product_barcodes')
        .insert(
          uniqueBarcodes.map((code, idx) => ({
            product_id: selectedProduct.id,
            code,
            batch_id: mode === 'B' ? null : (resolvedBatchId || null), // Option B doesn't use batches
            symbology: 'CODE128',
            is_primary: idx === 0 && !selectedProduct.skuBarcode
          }))
        )

      if (barcodesError) {
        // If it's a duplicate code constraint violation, customize the error message
        if (barcodesError.code === '23505') {
          throw new Error('One or more of the generated barcodes already exists in the system.')
        }
        throw barcodesError
      }

      // Also update the product's primary SKU barcode if it doesn't already have one
      if (!selectedProduct.skuBarcode) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ sku_barcode: primaryBarcode })
          .eq('id', selectedProduct.id)

        if (updateError) throw updateError
      }

      // Invalidate React Query caches
      await queryClient.invalidateQueries({ queryKey: ['batches', selectedProduct.id] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['last_barcode', selectedProduct.id] })

      void navigate('/barcodes')
    } catch (err: any) {
      setSubmitError(toUserMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  // Print Batch Canvas Trigger
  const handlePrintBatch = () => {
    if (!selectedProduct) return
    const items: BarcodeLabelData[] = generatedSequence.map((code) => ({
      barcode: code,
      productName: selectedProduct.name,
      categoryOrModel: selectedProduct.categoryName || undefined,
      brand: selectedProduct.brandName || undefined
    }))
    setPrintItems(items)
  }

  if (printItems) {
    return <BarcodeCanvasA4 items={printItems} onBack={() => setPrintItems(null)} />
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">Generate barcode</h1>
        <Alert tone="error">{toUserMessage(loadError)}</Alert>
      </div>
    )
  }

  if (isPending) {
    return (
      <Card>
        <SpinnerPane label="Loading form…" />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      {/* BREADCRUMBS & HEADER */}
      <div>
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-body-sm">
          <Link className="text-on-surface-variant/60 hover:text-on-surface" to="/barcodes">
            Barcodes
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-outline" strokeWidth={1.5} />
          <span className="text-on-surface-variant">
            {selectedProduct ? selectedProduct.name : 'Generate barcode'}
          </span>
        </nav>
        <h1 className="text-h1 text-on-surface">Generate barcode</h1>
      </div>

      {submitError && <Alert tone="error">{submitError}</Alert>}

      {/* CLEAN MINIMAL FORM CARD */}
      <Card>
        <form onSubmit={handleSave} className="p-6 space-y-6">
          {/* Target Product & Custom Quantity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Select
                label="Target Product"
                options={productOptions}
                value={selectedProductId || selectedProduct?.id || ''}
                onChange={(val) => {
                  setSelectedProductId(val)
                  const prod = products.find((p) => p.id === val)
                  if (prod?.skuBarcode) setCustomManufacturerBarcode(prod.skuBarcode)
                }}
              />
            </div>

            <div>
              <Field
                label="Quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                placeholder="Enter quantity"
              />
            </div>
          </div>

          {/* Batch Selection & Creation */}
          <div className="space-y-4 pt-2 border-t border-border/20">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-body-sm font-semibold text-on-surface cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={createNewBatch}
                  onChange={(e) => setCreateNewBatch(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                Create New Batch
              </label>
            </div>

            {createNewBatch ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="New Batch Code"
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                  placeholder="e.g. BATCH-20260720-001"
                  required
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Select Existing Batch"
                  options={batchOptions}
                  value={selectedBatchId}
                  onChange={(val) => setSelectedBatchId(val)}
                  placeholder={batchOptions.length === 0 ? "No batches available" : "Choose a batch"}
                  disabled={batchOptions.length === 0}
                />
              </div>
            )}
          </div>

          {/* Mode Selection Tabs */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-surface-variant/30 rounded-xl border border-border/50">
              <button
                type="button"
                onClick={() => setMode('A')}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 text-body-sm rounded-lg transition-all duration-200 ease-in-out ${
                  mode === 'A'
                    ? 'bg-surface text-primary shadow-sm ring-1 ring-border/80 font-bold scale-[1.01]'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20 font-medium'
                }`}
              >
                Option A: Auto-Generated Format
              </button>
              <button
                type="button"
                onClick={() => setMode('B')}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 text-body-sm rounded-lg transition-all duration-200 ease-in-out ${
                  mode === 'B'
                    ? 'bg-surface text-primary shadow-sm ring-1 ring-border/80 font-bold scale-[1.01]'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20 font-medium'
                }`}
              >
                Option B: Manufacturer Barcode
              </button>
            </div>

            {mode === 'A' ? (
              <div className="space-y-3 p-4 rounded-xl bg-surface-variant/20 border border-border/50 transition-all duration-200">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="block text-body-sm font-semibold text-on-surface">
                      Format Pattern
                    </label>
                    {/* Info Icon with Hover for Format Structure Breakdown */}
                    <button
                      type="button"
                      onClick={() => setShowInfo(!showInfo)}
                      onMouseEnter={() => setShowInfo(true)}
                      onMouseLeave={() => setShowInfo(false)}
                      className="p-1 rounded-md text-primary hover:bg-primary-container/20 transition-colors relative"
                      title="Hover or click to view format structure breakdown"
                    >
                      <Info className="size-4" />
                    </button>
                  </div>

                  <Select
                    label=""
                    options={formatSelectOptions}
                    value={selectedFormatId}
                    onChange={(val) => setSelectedFormatId(val as BarcodeFormatId)}
                  />
                </div>

                {/* Custom Prefix Field */}
                {selectedFormatId === 'CUSTOM_PREFIX' && (
                  <Field
                    label="Custom Prefix"
                    value={customPrefix}
                    onChange={(e) => setCustomPrefix(e.target.value)}
                    placeholder="e.g. SIDD"
                  />
                )}

                {/* Starting Sequence Number Field */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Starting Sequence Number"
                    type="number"
                    min={1}
                    value={startSeq}
                    onChange={(e) => setStartSeq(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    placeholder="e.g. 1"
                    hint="Auto-suggested from the latest barcode in database to maintain sequence accountability."
                  />
                </div>

                {/* MONOCHROME FORMAT STRUCTURE BREAKDOWN INFO POPUP */}
                {showInfo && (
                  <div className="p-3 bg-surface rounded-lg border border-border/60 space-y-1.5 animate-in fade-in duration-150">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">
                      Format Structure Breakdown:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {(currentFormatOption?.parts || []).map((part, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border/60 bg-surface-variant/40 text-xs font-mono font-medium text-on-surface"
                          title={part.description}
                        >
                          <span className="font-bold">{part.label}</span>
                          <span className="text-[10px] text-on-surface-variant/70">({part.description})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface-variant/20 border border-border/50">
                <Field
                  label="Manufacturer Barcode"
                  value={customManufacturerBarcode}
                  onChange={(e) => setCustomManufacturerBarcode(e.target.value)}
                  placeholder="e.g. 8901234567890"
                />
              </div>
            )}
          </div>

          {/* STICKER PREVIEW & SEQUENCE REVIEW */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Sticker Preview Box */}
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

            {/* Generated Sequence List */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-on-surface">
                <span className="flex items-center gap-1.5">
                  <ListOrdered className="size-3.5 text-primary" />
                  Sequence Review ({generatedSequence.length} Units)
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-surface-variant/20 rounded-xl border border-border/60 font-mono text-xs">
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

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
            <Button variant="ghost" onClick={() => void navigate('/barcodes')} type="button">
              Cancel
            </Button>
            <Button variant="secondary" onClick={handlePrintBatch} type="button">
              <Printer className="size-4 mr-2" />
              Print Labels ({quantity})
            </Button>
            <Button variant="primary" type="submit" isLoading={isSaving}>
              <CheckCircle2 className="size-4 mr-2" />
              Save & Link Barcode
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
