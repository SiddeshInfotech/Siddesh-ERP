<<<<<<< Updated upstream
import { ArrowDownToLine, CheckCircle2, FileText, Truck, User } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { useProductPicker } from '@/hooks/useProductPicker'
import { useSaveInward } from '@/hooks/useSaveMovement'
import { toUserMessage } from '@/lib/errors'
import {
  findGstProblem,
  findMobileProblem,
  findQtyProblem,
  normaliseGst,
  orNull
} from '@/lib/movementForm'

/**
 * Inward — receive stock into the store (SRD §5; DSK-301 → DSK-309).
 *
 * Carries every field SRD §5 asks for: product, quantity, supplier name / mobile / GST,
 * invoice number and date, purchase order, and who brought the material.
 *
 * NOT built: DSK-307, attaching the invoice PDF or photo. It is P2 and needs a Supabase
 * Storage bucket with its own RLS, which does not exist yet.
 */

interface Errors {
  qty?: string
  supplierName?: string
  supplierMobile?: string
  supplierGst?: string
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2 hairline-b px-5 py-3.5">
        {icon}
        <h2 className="text-label-caps uppercase text-on-surface-variant">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

interface Saved {
  productName: string
  qty: number
  balanceAfter: number
  replayed: boolean
}

export function Inward() {
  const picker = useProductPicker()
  const saveInward = useSaveInward()

  const [qty, setQty] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierMobile, setSupplierMobile] = useState('')
  const [supplierGst, setSupplierGst] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [purchaseOrder, setPurchaseOrder] = useState('')
  const [broughtBy, setBroughtBy] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState<Saved | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  /**
   * Rule 0.5 — minted ONCE, on mount, and reused on every retry of this submission.
   *
   * If this were generated in the submit handler, a retry after a timeout would carry a new
   * id, `app.replay_if_seen` would not recognise it, and the same delivery would be received
   * twice. Nobody would notice until a stock count months later. `useRef` is what makes it
   * survive re-renders; `resetForNextEntry` mints the next one only once this entry is done.
   */
  const clientTxnId = useRef(crypto.randomUUID())

  function resetForNextEntry() {
    picker.reset()
    setQty('')
    setSupplierName('')
    setSupplierMobile('')
    setSupplierGst('')
    setInvoiceNo('')
    setInvoiceDate('')
    setPurchaseOrder('')
    setBroughtBy('')
    setNotes('')
    setErrors({})
    setSaved(null)
    // A new submission is a new transaction, so it gets a new id. This is the ONLY place a
    // second id is minted.
    clientTxnId.current = crypto.randomUUID()
  }

  function validate(): Errors {
    const found: Errors = {}

    const qtyProblem = findQtyProblem(qty)
    if (qtyProblem !== null) found.qty = qtyProblem

    if (supplierName.trim().length === 0) found.supplierName = 'Enter the supplier name.'

    const mobileProblem = findMobileProblem(supplierMobile)
    if (mobileProblem !== null) found.supplierMobile = mobileProblem

    const gstProblem = findGstProblem(supplierGst)
    if (gstProblem !== null) found.supplierGst = gstProblem

    return found
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (picker.picked === null) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    saveInward.mutate(
      {
        clientTxnId: clientTxnId.current,
        productId: picker.picked.id,
        qty: Number(qty.trim()),
        supplierName: supplierName.trim(),
        supplierMobile: orNull(supplierMobile),
        supplierGst: normaliseGst(supplierGst),
        invoiceNo: orNull(invoiceNo),
        invoiceDate: orNull(invoiceDate),
        purchaseOrder: orNull(purchaseOrder),
        broughtBy: orNull(broughtBy),
        notes: orNull(notes)
      },
      {
        onSuccess: (result) => {
          setSaved({
            productName: picker.picked?.name ?? '',
            qty: Number(qty.trim()),
            balanceAfter: result.balance_after,
            replayed: result.replayed
          })
        }
      }
    )
  }

  // DSK-309 — confirm the receipt and show the new stock total.
  if (saved !== null) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">Stock received</h1>

        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <CheckCircle2 aria-hidden="true" className="size-10 text-success" strokeWidth={1.5} />

          <div>
            <p className="text-h2 text-on-surface">{saved.productName}</p>
            <p className="text-body-md text-on-surface-variant/70">
              Received {saved.qty} — stock is now
            </p>
          </div>

          <p className="text-[56px] font-semibold leading-none tabular-nums text-success">
            {saved.balanceAfter}
          </p>

          {/* Honest about a replay: the user pressed save twice, or a retry landed. Stock did
              not move again, and saying so beats implying a second receipt. */}
          {saved.replayed ? (
            <Alert tone="info">
              This receipt was already saved, so stock was not added a second time.
            </Alert>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button onClick={resetForNextEntry}>Receive more stock</Button>
          </div>
        </Card>
      </div>
    )
  }

  const isSaveable = picker.picked !== null

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <h1 className="text-h1 text-on-surface">Inward</h1>
        <p className="text-body-sm text-on-surface-variant/60">Receive stock into the store.</p>
      </div>

      <form className="flex flex-col gap-gutter" noValidate onSubmit={handleSubmit} ref={formRef}>
        <Section
          icon={
            <ArrowDownToLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          title="Product"
        >
          <div className="flex flex-col gap-4">
            <ProductPicker picker={picker} />

            <Field
              containerClassName="max-w-xs"
              error={errors.qty}
              hint="How many units arrived."
              inputMode="numeric"
              label="Quantity received"
              min={1}
              onChange={(event) => setQty(event.target.value)}
              required
              type="number"
              value={qty}
            />
          </div>
        </Section>

        <Section
          icon={<User aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Supplier"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              error={errors.supplierName}
              hint="Reused if this supplier already exists."
              label="Supplier name"
              onChange={(event) => setSupplierName(event.target.value)}
              required
              value={supplierName}
            />
            <Field
              error={errors.supplierMobile}
              hint="Optional. 10 digits."
              inputMode="numeric"
              label="Supplier mobile"
              onChange={(event) => setSupplierMobile(event.target.value)}
              value={supplierMobile}
            />
            <Field
              containerClassName="col-span-2"
              error={errors.supplierGst}
              hint="Optional. 15 characters, e.g. 27AAAAA0000A1Z5."
              label="GST number"
              mono
              onChange={(event) => setSupplierGst(event.target.value.toUpperCase())}
              value={supplierGst}
            />
          </div>
        </Section>

        <Section
          icon={<FileText aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Invoice"
        >
          <div className="grid grid-cols-3 gap-4">
            <Field
              hint="Optional."
              label="Invoice number"
              onChange={(event) => setInvoiceNo(event.target.value)}
              value={invoiceNo}
            />
            <Field
              hint="Optional."
              label="Invoice date"
              onChange={(event) => setInvoiceDate(event.target.value)}
              type="date"
              value={invoiceDate}
            />
            <Field
              hint="Optional."
              label="Purchase order number"
              onChange={(event) => setPurchaseOrder(event.target.value)}
              value={purchaseOrder}
            />
          </div>
        </Section>

        <Section
          icon={<Truck aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Delivery"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              hint="Own staff, or a courier like Blue Dart or DTDC."
              label="Brought by"
              onChange={(event) => setBroughtBy(event.target.value)}
              value={broughtBy}
            />
            <Textarea
              containerClassName="col-span-2"
              hint="Optional."
              label="Notes"
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              value={notes}
            />
          </div>
        </Section>

        {saveInward.error === null ? null : (
          <Alert shake tone="error">
            {toUserMessage(saveInward.error)}
          </Alert>
        )}

        <div className="flex items-center justify-end gap-3 pb-2">
          {/* isLoading disables the button: a double-click here is a double receipt, and the
              client_txn_id above is the second line of defence, not the first. */}
          <Button disabled={!isSaveable} isLoading={saveInward.isPending} size="lg" type="submit">
            {saveInward.isPending ? 'Saving…' : 'Save inward'}
          </Button>
        </div>
      </form>
=======
import { useState, useMemo } from 'react'
import { ArrowDownLeft, Scan, CheckCircle2, Truck, FileText, Package, Sparkles, AlertTriangle, Layers } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InwardScanTracker, InwardUnitItem } from '@/components/inward/InwardScanTracker'
import { formatBarcodeNumber, isBarcodeUnique, generateBarcodeRange } from '@/lib/sequence'

interface ProductRecord {
  id: string
  name: string
  primaryBarcode: string | null
  currentStock: number
  category: string
  brand?: string
}

const INITIAL_PRODUCTS: ProductRecord[] = [
  { id: '1', name: 'Arduino UNO R3 Board', primaryBarcode: 'ST00000001', currentStock: 45, category: 'AI Lab', brand: 'Arduino' },
  { id: '2', name: 'Servo Motor SG90', primaryBarcode: 'ST00000002', currentStock: 120, category: 'AI Lab', brand: 'TowerPro' },
  { id: '3', name: 'RFID RC522 Module', primaryBarcode: 'ST00000003', currentStock: 30, category: 'AI Lab', brand: 'Siddesh' },
  { id: '4', name: '64 GB Pen Drive (Std 1-4)', primaryBarcode: 'ST00000004', currentStock: 80, category: 'Digital Products', brand: 'SanDisk' },
  { id: '5', name: 'VR Headset (New Stock)', primaryBarcode: null, currentStock: 0, category: 'AI Lab', brand: 'Generic' } // Product without barcode to test generator
]

export function Inward() {
  const [productsList, setProductsList] = useState<ProductRecord[]>(INITIAL_PRODUCTS)
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [scanOrSearchInput, setScanOrSearchInput] = useState<string>('')

  // Barcode Generation State (if selected product has no primary barcode)
  const [generatedBarcode, setGeneratedBarcode] = useState<string>('')
  const [barcodeMode, setBarcodeMode] = useState<'AUTO' | 'MANUAL'>('AUTO')
  const [barcodeError, setBarcodeError] = useState<string | null>(null)

  // Quantity & Units State
  const [quantity, setQuantity] = useState<number>(5)
  const [inwardUnits, setInwardUnits] = useState<InwardUnitItem[]>([])

  // Supplier & Logistics Form State
  const [supplierName, setSupplierName] = useState<string>('')
  const [supplierMobile, setSupplierMobile] = useState<string>('')
  const [gstNo, setGstNo] = useState<string>('')
  const [invoiceNo, setInvoiceNo] = useState<string>('')
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [purchaseOrderNo, setPurchaseOrderNo] = useState<string>('')
  const [broughtBy, setBroughtBy] = useState<string>('Courier (Blue Dart)')

  const [isSaved, setIsSaved] = useState<boolean>(false)

  // Currently selected product
  const selectedProduct = useMemo(() => {
    return productsList.find((p) => p.id === selectedProductId) || null
  }, [productsList, selectedProductId])

  // Existing system barcodes for global uniqueness validation
  const existingSystemBarcodes = useMemo(() => {
    const list: string[] = []
    productsList.forEach((p) => {
      if (p.primaryBarcode) list.push(p.primaryBarcode)
    })
    return list
  }, [productsList])

  // Active barcode (either existing primaryBarcode or newly generated/assigned)
  const activeBarcode = selectedProduct?.primaryBarcode || generatedBarcode

  // Handle Product Selection
  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId)
    setBarcodeError(null)

    const prod = productsList.find((p) => p.id === prodId)
    if (prod && !prod.primaryBarcode) {
      // Product has no barcode -> auto-generate unique ST barcode
      let nextIndex = existingSystemBarcodes.length + 1
      let candidate = formatBarcodeNumber(nextIndex)
      while (!isBarcodeUnique(candidate, existingSystemBarcodes)) {
        nextIndex++
        candidate = formatBarcodeNumber(nextIndex)
      }
      setGeneratedBarcode(candidate)
    } else {
      setGeneratedBarcode('')
    }
  }

  // Handle Scan / Search Input Match
  const handleScanOrSearchChange = (query: string) => {
    setScanOrSearchInput(query)
    const match = productsList.find(
      (p) =>
        (p.primaryBarcode && p.primaryBarcode.toLowerCase() === query.trim().toLowerCase()) ||
        p.name.toLowerCase().includes(query.trim().toLowerCase())
    )
    if (match) {
      handleSelectProduct(match.id)
    }
  }

  // Generate / Update Barcode on-the-fly
  const handleGenerateOnTheFly = () => {
    setBarcodeError(null)
    let nextIndex = existingSystemBarcodes.length + Math.floor(Math.random() * 10) + 1
    let candidate = formatBarcodeNumber(nextIndex)
    while (!isBarcodeUnique(candidate, existingSystemBarcodes)) {
      nextIndex++
      candidate = formatBarcodeNumber(nextIndex)
    }
    setGeneratedBarcode(candidate)
  }

  // Update Quantity & Sync Units
  const handleQuantityChange = (newQty: number) => {
    const safeQty = Math.max(1, newQty)
    setQuantity(safeQty)

    if (selectedProduct && activeBarcode) {
      const barcodeRange = generateBarcodeRange(1, safeQty, activeBarcode + '-')
      const newUnits: InwardUnitItem[] = barcodeRange.map((code, idx) => ({
        id: `unit-${idx + 1}`,
        unitBarcode: code,
        productName: selectedProduct.name,
        isScanned: false
      }))
      setInwardUnits(newUnits)
    }
  }

  // Trigger unit synchronization whenever selected product or quantity changes
  const prepareUnitsForBatch = () => {
    if (!selectedProduct || !activeBarcode) return
    const barcodeRange = generateBarcodeRange(1, quantity, activeBarcode + '-')
    const newUnits: InwardUnitItem[] = barcodeRange.map((code, idx) => ({
      id: `unit-${idx + 1}`,
      unitBarcode: code,
      productName: selectedProduct.name,
      isScanned: false
    }))
    setInwardUnits(newUnits)
  }

  // Save Inward Action
  const handleSaveInwardSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct || quantity <= 0) return

    // If product had no primary barcode, assign activeBarcode to it globally
    if (!selectedProduct.primaryBarcode && generatedBarcode) {
      selectedProduct.primaryBarcode = generatedBarcode
    }

    // Increase current stock
    selectedProduct.currentStock += quantity
    setIsSaved(true)
  }

  const handleReset = () => {
    setSelectedProductId('')
    setScanOrSearchInput('')
    setGeneratedBarcode('')
    setQuantity(5)
    setInwardUnits([])
    setSupplierName('')
    setSupplierMobile('')
    setGstNo('')
    setInvoiceNo('')
    setPurchaseOrderNo('')
    setBroughtBy('Courier (Blue Dart)')
    setIsSaved(false)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownLeft className="w-6 h-6 text-emerald-600" />
            Inward Entry Workflow
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Receive stock, assign unique barcodes, verify scanned vs unscanned products, and record supplier details.
          </p>
        </div>
      </div>

      {isSaved ? (
        <Card className="p-8 bg-emerald-50/90 border border-emerald-200 text-center space-y-4 rounded-2xl shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-950">Inward Entry Saved Successfully!</h2>
            <p className="text-xs text-emerald-800 mt-1">
              Received <strong className="font-bold">{quantity}</strong> unit(s) of{' '}
              <strong className="font-bold">{selectedProduct?.name}</strong> (Barcode:{' '}
              <span className="font-mono font-bold">{activeBarcode}</span>).
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              New Stock Total: <span className="font-mono font-bold">{selectedProduct?.currentStock} units</span>
            </p>
          </div>
          <Button onClick={handleReset} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-6 py-2.5">
            Record Another Inward Entry
          </Button>
        </Card>
      ) : (
        <form onSubmit={handleSaveInwardSubmit} className="space-y-6">
          {/* Step 1 & 2: Product Selector & Barcode Generator */}
          <Card className="p-5 bg-white border border-slate-200 shadow-sm rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Scan className="w-4 h-4 text-indigo-600" />
              1. Product & Barcode Selection (Global Uniqueness)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scan Barcode or Search Product Name
                </label>
                <input
                  type="text"
                  value={scanOrSearchInput}
                  onChange={(e) => handleScanOrSearchChange(e.target.value)}
                  placeholder="Scan or type product name..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Product *</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => {
                    handleSelectProduct(e.target.value)
                    setTimeout(prepareUnitsForBatch, 100)
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Select Product from Catalog --</option>
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.primaryBarcode ? `(${p.primaryBarcode})` : '[No Barcode]'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Product Barcode Status */}
            {selectedProduct && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">{selectedProduct.name}</h3>
                      <p className="text-[11px] text-slate-500">
                        Category: {selectedProduct.category} | Brand: {selectedProduct.brand || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">Current Stock</span>
                    <div className="text-sm font-bold text-slate-900 font-mono">{selectedProduct.currentStock} units</div>
                  </div>
                </div>

                {/* Barcode Status / On-the-fly Generator */}
                {selectedProduct.primaryBarcode ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Primary Barcode Available
                    </span>
                    <span className="font-mono font-bold text-emerald-800 bg-white px-2.5 py-1 rounded border border-emerald-200">
                      {selectedProduct.primaryBarcode}
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        No Primary Barcode Assigned
                      </span>
                      <button
                        type="button"
                        onClick={handleGenerateOnTheFly}
                        className="flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-md shadow-xs transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate Unique Barcode
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={generatedBarcode}
                        onChange={(e) => {
                          const val = e.target.value
                          setGeneratedBarcode(val)
                          if (!isBarcodeUnique(val, existingSystemBarcodes)) {
                            setBarcodeError('Barcode string already exists in database!')
                          } else {
                            setBarcodeError(null)
                          }
                        }}
                        placeholder="Generated or pasted barcode string..."
                        className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-md text-xs font-mono font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                    {barcodeError && (
                      <p className="text-[11px] font-bold text-rose-600">{barcodeError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Step 3: Quantity Received & Live Scanned/Unscanned Verification */}
          {selectedProduct && (
            <Card className="p-5 bg-white border border-slate-200 shadow-sm rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                  <Package className="w-4 h-4 text-indigo-600" />
                  2. Quantity Received & Unit Verification
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700">Receiving Quantity:</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1
                      handleQuantityChange(val)
                    }}
                    className="w-24 px-3 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <Button
                    type="button"
                    onClick={prepareUnitsForBatch}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs px-3 py-1.5 border border-indigo-200"
                  >
                    Sync Units List
                  </Button>
                </div>
              </div>

              {/* Scanned vs Unscanned Tracker */}
              {inwardUnits.length > 0 && (
                <InwardScanTracker
                  productName={selectedProduct.name}
                  totalQuantity={quantity}
                  units={inwardUnits}
                  onUnitsChange={(updated) => setInwardUnits(updated)}
                />
              )}
            </Card>
          )}

          {/* Step 4 & 5: Supplier Details & Logistics Details */}
          <Card className="p-5 bg-white border border-slate-200 shadow-sm rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <FileText className="w-4 h-4 text-emerald-600" />
              3. Supplier Details & Delivery Information
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. RoboMart Tech Supplies"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Mobile</label>
                <input
                  type="text"
                  value={supplierMobile}
                  onChange={(e) => setSupplierMobile(e.target.value)}
                  placeholder="e.g. 9822012345"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">GST Number (Optional)</label>
                <input
                  type="text"
                  value={gstNo}
                  onChange={(e) => setGstNo(e.target.value)}
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-2026-098"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Order (PO) No</label>
                <input
                  type="text"
                  value={purchaseOrderNo}
                  onChange={(e) => setPurchaseOrderNo(e.target.value)}
                  placeholder="e.g. PO-88712"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Logistics Person Field */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Person Who Brought Material / Courier
              </label>
              <input
                type="text"
                value={broughtBy}
                onChange={(e) => setBroughtBy(e.target.value)}
                placeholder="e.g. Atharva Birari, Courier - Blue Dart, DTDC, Supplier Representative"
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </Card>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={!selectedProduct || quantity <= 0 || !supplierName.trim() || !!barcodeError}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs px-6 py-3 rounded-xl shadow-md"
            >
              Save Inward Entry & Post Stock
            </Button>
          </div>
        </form>
      )}
>>>>>>> Stashed changes
    </div>
  )
}
