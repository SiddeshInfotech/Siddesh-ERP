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
import {
  BARCODE_SYMBOLOGY_LABELS,
  describeBarcodeProblem,
  detectSymbology,
  findBarcodeProblem,
  type BarcodeSymbology
} from '@/lib/barcode'
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
  const [quantity, setQuantity] = useState<number | ''>(10)
  const [batchCode, setBatchCode] = useState<string>('')
  const [createNewBatch, setCreateNewBatch] = useState<boolean>(true)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')

  // Barcode Mode State
  const [mode, setMode] = useState<'A' | 'B'>('A')
  const [selectedFormatId, setSelectedFormatId] = useState<BarcodeFormatId>('SKU_DATE_SEQ')
  const [customPrefix, setCustomPrefix] = useState<string>('SIDD')
  const [customManufacturerBarcode, setCustomManufacturerBarcode] = useState<string>('')
  // Symbology of the manufacturer code (Option B). Auto-guessed from the code, user-overridable.
  const [symbology, setSymbology] = useState<BarcodeSymbology>('CODE128')
  const [symbologyTouched, setSymbologyTouched] = useState<boolean>(false)
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
  const [isPrinting, setIsPrinting] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
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

  const symbologyOptions: SelectOption[] = useMemo(
    () =>
      (Object.entries(BARCODE_SYMBOLOGY_LABELS) as [BarcodeSymbology, string][]).map(
        ([value, label]) => ({ value, label })
      ),
    []
  )

  // Format option metadata
  const currentFormatOption = useMemo(
    () => BARCODE_FORMAT_OPTIONS.find((f) => f.id === selectedFormatId) || BARCODE_FORMAT_OPTIONS[0],
    [selectedFormatId]
  )

  // Option B (manufacturer barcode): the code is registered ONCE as an alias for the product,
  // never per unit — a manufacturer prints the same code on every box, so quantity/batch/format
  // do not apply here. Quantity is tracked later, at Inward/Outward.
  const manufacturerCode = customManufacturerBarcode.trim()
  const manufacturerProblem = mode === 'B' ? findBarcodeProblem(customManufacturerBarcode) : null

  // Generated Barcode Sequence list (Option A only). For Option B this is just the single code,
  // used to feed the preview; the save path uses `manufacturerCode` directly.
  const generatedSequence: string[] = useMemo(() => {
    if (mode === 'B') {
      return manufacturerCode ? [manufacturerCode] : []
    }

    const validQuantity = typeof quantity === 'number' && quantity > 0 ? quantity : 1
    return generateCustomBarcodeSequence(selectedFormatId, startSeq, validQuantity, {
      skuCode: selectedProduct?.name ? selectedProduct.name.slice(0, 4) : 'PROD',
      categoryName: selectedProduct?.categoryName || 'GEN',
      customPrefix,
      date: new Date()
    })
  }, [mode, selectedFormatId, startSeq, quantity, selectedProduct, manufacturerCode, customPrefix])

  // Keep the symbology guess in step with the code until the user overrides it by hand.
  useEffect(() => {
    if (mode !== 'B' || symbologyTouched) return
    setSymbology(detectSymbology(customManufacturerBarcode))
  }, [mode, customManufacturerBarcode, symbologyTouched])

  useEffect(() => {
    setHasSaved(false)
  }, [generatedSequence])

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

  const invalidateAfterSave = async (productId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['batches', productId] })
    await queryClient.invalidateQueries({ queryKey: ['products'] })
    await queryClient.invalidateQueries({ queryKey: ['last_barcode', productId] })
    await queryClient.invalidateQueries({ queryKey: ['batch_registry'] })
    await queryClient.invalidateQueries({ queryKey: ['batch_barcodes_v5'] })
  }

  /**
   * Registers a manufacturer's printed barcode as an alias for the selected product (SRD §4
   * Option B). Exactly ONE row: the same code is printed on every unit, so it is product
   * identity, not a per-unit token — no batch, no quantity, no sequence. Quantity is recorded
   * later, at Inward/Outward.
   *
   * @throws When the code is invalid, or already registered to a product in this office
   *         (uq_product_barcode_code). The server owns both checks; this only fails fast.
   */
  const linkManufacturerBarcode = async () => {
    if (!selectedProduct) throw new Error('No product selected')
    const problem = findBarcodeProblem(customManufacturerBarcode)
    if (problem) throw new Error(describeBarcodeProblem(problem))

    const { error } = await supabase.from('product_barcodes').insert({
      product_id: selectedProduct.id,
      code: manufacturerCode,
      symbology,
      batch_id: null,
      // Becomes the primary (printed) code only if the product has none yet; otherwise it is an
      // additional alias. A second primary would violate uq_product_barcode_primary.
      is_primary: !selectedProduct.skuBarcode
    })

    if (error) {
      if (error.code === '23505') {
        throw new Error('This barcode is already registered to a product in this office.')
      }
      throw error
    }

    await invalidateAfterSave(selectedProduct.id)
    setHasSaved(true)
  }

  // Save Barcode & Return to /barcodes (Backend records timestamp automatically)
  const saveBarcodesToDB = async () => {
    if (hasSaved) return
    if (!selectedProduct) throw new Error('No product selected')

    if (mode === 'B') {
      await linkManufacturerBarcode()
      return
    }

    // ── Option A: generate our own unique per-unit codes into a batch ──
    const primaryBarcode = generatedSequence[0]
    if (!primaryBarcode) throw new Error('No barcode generated')

    let resolvedBatchId: string | null = null

    if (createNewBatch) {
      if (!batchCode.trim()) {
        throw new Error('Batch code is required when creating a new batch.')
      }
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

    const { error: barcodesError } = await supabase
      .from('product_barcodes')
      .insert(
        generatedSequence.map((code, idx) => ({
          product_id: selectedProduct.id,
          code,
          batch_id: resolvedBatchId,
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

    await invalidateAfterSave(selectedProduct.id)
    setHasSaved(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setSubmitError(null)

    try {
      await saveBarcodesToDB()
      void navigate('/barcodes')
    } catch (err: any) {
      setSubmitError(toUserMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  // Print Batch Canvas Trigger
  const handlePrintBatch = async () => {
    if (!selectedProduct) return
    setIsPrinting(true)
    setSubmitError(null)

    try {
      await saveBarcodesToDB()
      const items: BarcodeLabelData[] = generatedSequence.map((code) => ({
        barcode: code,
        productName: selectedProduct.name,
        categoryOrModel: selectedProduct.categoryName || undefined,
        brand: selectedProduct.brandName || undefined
      }))
      setPrintItems(items)
    } catch (err: any) {
      setSubmitError(toUserMessage(err))
    } finally {
      setIsPrinting(false)
    }
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
            <div className={mode === 'B' ? 'md:col-span-3' : 'md:col-span-2'}>
              <Select
                label="Target Product"
                options={productOptions}
                value={selectedProductId || selectedProduct?.id || ''}
                onChange={(val) => setSelectedProductId(val)}
              />
            </div>

            {/* Quantity drives per-unit label generation (Option A only). A manufacturer code is
                registered once, so it has no quantity here — that is counted at Inward/Outward. */}
            {mode === 'A' && (
              <div>
                <Field
                  label="Quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '') {
                      setQuantity('')
                    } else {
                      const num = parseInt(val, 10)
                      setQuantity(isNaN(num) ? '' : num)
                    }
                  }}
                  placeholder="Enter quantity"
                />
              </div>
            )}
          </div>

          {/* Batch Selection & Creation — Option A only. A manufacturer barcode is not batched. */}
          {mode === 'A' && (
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
          )}

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
              <div className="space-y-3 p-4 rounded-xl bg-surface-variant/20 border border-border/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Manufacturer Barcode"
                    value={customManufacturerBarcode}
                    onChange={(e) => setCustomManufacturerBarcode(e.target.value)}
                    placeholder="e.g. 8901234567890"
                    error={customManufacturerBarcode.length > 0 && manufacturerProblem
                      ? describeBarcodeProblem(manufacturerProblem)
                      : undefined}
                    mono
                    required
                  />
                  <Select
                    label="Symbology"
                    options={symbologyOptions}
                    value={symbology}
                    onChange={(val) => {
                      setSymbology(val as BarcodeSymbology)
                      setSymbologyTouched(true)
                    }}
                  />
                </div>
                <p className="text-body-sm text-on-surface-variant/70">
                  Type the barcode exactly as printed on the box. It is registered once as another
                  name for this product — every unit shares it, so quantity is counted at Inward and
                  Outward, not here. Nothing is printed.
                </p>
              </div>
            )}
          </div>

          {/* PREVIEW & REVIEW */}
          {mode === 'A' ? (
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
                <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-surface-variant/20 rounded-xl border border-border/60 font-mono text-xs [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
          ) : (
            // Option B: no barcode is rendered — a Code 128 picture of an EAN-13 would be a wrong
            // label, and the real symbol is already on the box. Show what will be linked instead.
            <div className="pt-2">
              <div className="rounded-xl border border-border/60 bg-surface-variant/20 p-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                  <Barcode className="size-3.5 text-primary" />
                  Will be linked to {selectedProduct?.name || 'the selected product'}
                </span>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-h2 font-bold text-primary break-all">
                    {manufacturerCode || '—'}
                  </span>
                  <span className="text-body-sm text-on-surface-variant/70">
                    {BARCODE_SYMBOLOGY_LABELS[symbology]}
                  </span>
                </div>
                <p className="mt-2 text-body-sm text-on-surface-variant/60">
                  {selectedProduct?.skuBarcode
                    ? 'Added as an additional barcode for this product.'
                    : 'This will become the product’s primary barcode.'}
                </p>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
            <Button variant="ghost" onClick={() => void navigate('/barcodes')} type="button">
              Cancel
            </Button>
            {/* Printing is Option A only — a manufacturer already printed its own labels. */}
            {mode === 'A' && (
              <Button variant="secondary" onClick={handlePrintBatch} type="button" isLoading={isPrinting}>
                <Printer className="size-4 mr-2" />
                Print Labels ({quantity || 1})
              </Button>
            )}
            <Button
              variant="primary"
              type="submit"
              isLoading={isSaving}
              disabled={!selectedProduct || (mode === 'B' && manufacturerProblem !== null)}
            >
              <CheckCircle2 className="size-4 mr-2" />
              {mode === 'B' ? 'Link manufacturer barcode' : 'Save & Link Barcode'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
