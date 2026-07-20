<<<<<<< Updated upstream
import { ArrowUpFromLine, CheckCircle2, FileText, School, UserCheck } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useProductPicker } from '@/hooks/useProductPicker'
import { useSaveOutward, type OutwardType } from '@/hooks/useSaveMovement'
import { isInsufficientStock, toUserMessage } from '@/lib/errors'
import {
  findGstProblem,
  findMobileProblem,
  findQtyProblem,
  normaliseGst,
  orNull
} from '@/lib/movementForm'

/**
 * Outward — give out or sell stock (SRD §6; DSK-310 → DSK-320).
 *
 * Carries every field SRD §6 asks for: product, quantity, outward type, school name, contact
 * person, mobile, GST, address, invoice number, sales order number, who handed over and who
 * received.
 *
 * NOT built: DSK-317, signature or photo proof of delivery. It is P2 and needs a Storage
 * bucket plus a signature pad.
 */

/** SRD §6 step 4, verbatim. The enum in the database is the same list. */
const OUTWARD_TYPES: SelectOption[] = [
  { value: 'SALE', label: 'Sale', description: 'Sold to a school or customer' },
  { value: 'DEMO', label: 'Demo', description: 'Out for a demonstration' },
  { value: 'REPLACEMENT', label: 'Replacement', description: 'Replacing a faulty unit' },
  { value: 'INTERNAL_USE', label: 'Internal use', description: 'Used by our own team' },
  { value: 'SERVICE', label: 'Service', description: 'Out for repair or servicing' },
  { value: 'SAMPLE', label: 'Sample', description: 'Given as a sample' }
]

interface Errors {
  qty?: string
  partyName?: string
  mobile?: string
  partyGst?: string
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

export function Outward() {
  const picker = useProductPicker()
  const saveOutward = useSaveOutward()

  const [qty, setQty] = useState('')
  const [outwardType, setOutwardType] = useState<OutwardType>('SALE')
  const [partyName, setPartyName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [mobile, setMobile] = useState('')
  const [partyGst, setPartyGst] = useState('')
  const [partyAddress, setPartyAddress] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [salesOrderNo, setSalesOrderNo] = useState('')
  const [handedOverBy, setHandedOverBy] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState<Saved | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  /** Rule 0.5 — minted once on mount, reused on every retry. See Inward for why. */
  const clientTxnId = useRef(crypto.randomUUID())

  function resetForNextEntry() {
    picker.reset()
    setQty('')
    setOutwardType('SALE')
    setPartyName('')
    setContactPerson('')
    setMobile('')
    setPartyGst('')
    setPartyAddress('')
    setInvoiceNo('')
    setSalesOrderNo('')
    setHandedOverBy('')
    setReceivedBy('')
    setNotes('')
    setErrors({})
    setSaved(null)
    clientTxnId.current = crypto.randomUUID()
  }

  function validate(): Errors {
    const found: Errors = {}

    const qtyProblem = findQtyProblem(qty)
    if (qtyProblem !== null) found.qty = qtyProblem

    // Mirrors the RPC's PARTY_REQUIRED guard: a SALE must record who bought it.
    if (outwardType === 'SALE' && partyName.trim().length === 0) {
      found.partyName = 'A sale must record the school or customer.'
    }

    const mobileProblem = findMobileProblem(mobile)
    if (mobileProblem !== null) found.mobile = mobileProblem

    const gstProblem = findGstProblem(partyGst)
    if (gstProblem !== null) found.partyGst = gstProblem

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

    saveOutward.mutate(
      {
        clientTxnId: clientTxnId.current,
        productId: picker.picked.id,
        qty: Number(qty.trim()),
        outwardType,
        partyName: orNull(partyName),
        contactPerson: orNull(contactPerson),
        mobile: orNull(mobile),
        partyGst: normaliseGst(partyGst),
        partyAddress: orNull(partyAddress),
        invoiceNo: orNull(invoiceNo),
        salesOrderNo: orNull(salesOrderNo),
        handedOverBy: orNull(handedOverBy),
        receivedBy: orNull(receivedBy),
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

  if (saved !== null) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">Stock dispatched</h1>

        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <CheckCircle2 aria-hidden="true" className="size-10 text-success" strokeWidth={1.5} />

          <div>
            <p className="text-h2 text-on-surface">{saved.productName}</p>
            <p className="text-body-md text-on-surface-variant/70">
              Gave out {saved.qty} — stock is now
            </p>
          </div>

          <p className="text-[56px] font-semibold leading-none tabular-nums text-on-surface">
            {saved.balanceAfter}
          </p>

          {saved.replayed ? (
            <Alert tone="info">
              This dispatch was already saved, so stock was not reduced a second time.
            </Alert>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button onClick={resetForNextEntry}>Give out more stock</Button>
          </div>
        </Card>
      </div>
    )
  }

  const requestedQty = Number(qty.trim())
  // A warning, never a block (DSK-313). The client's idea of "available" is already stale —
  // only save_outward, holding the row lock, may actually refuse. Blocking here would also
  // mean two different rules for the same decision, and they would drift.
  const looksShort =
    picker.picked !== null &&
    Number.isFinite(requestedQty) &&
    requestedQty > 0 &&
    requestedQty > picker.picked.qtyAvailable

  const isSaveable = picker.picked !== null

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <h1 className="text-h1 text-on-surface">Outward</h1>
        <p className="text-body-sm text-on-surface-variant/60">Give out or sell stock.</p>
      </div>

      <form className="flex flex-col gap-gutter" noValidate onSubmit={handleSubmit} ref={formRef}>
        <Section
          icon={
            <ArrowUpFromLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          title="Product"
        >
          <div className="flex flex-col gap-4">
            <ProductPicker emphasiseStock picker={picker} />

            <div className="grid grid-cols-2 gap-4">
              <Field
                error={errors.qty}
                inputMode="numeric"
                label="Quantity to give out"
                min={1}
                onChange={(event) => setQty(event.target.value)}
                required
                type="number"
                value={qty}
              />

              <Select
                label="Outward type"
                onChange={(next) => setOutwardType(next as OutwardType)}
                options={OUTWARD_TYPES}
                value={outwardType}
              />
            </div>

            {looksShort ? (
              <Alert tone="warning">
                Only {picker.picked?.qtyAvailable} available — this asks for {requestedQty}. The
                database will refuse if there is not enough when you save.
              </Alert>
            ) : null}
          </div>
        </Section>

        <Section
          icon={<School aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Party"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              error={errors.partyName}
              hint="Reused if this school already exists."
              label="School / customer name"
              onChange={(event) => setPartyName(event.target.value)}
              required={outwardType === 'SALE'}
              value={partyName}
            />
            <Field
              hint="Optional."
              label="Contact person"
              onChange={(event) => setContactPerson(event.target.value)}
              value={contactPerson}
            />
            <Field
              error={errors.mobile}
              hint="Optional. 10 digits."
              inputMode="numeric"
              label="Mobile number"
              onChange={(event) => setMobile(event.target.value)}
              value={mobile}
            />
            <Field
              error={errors.partyGst}
              hint="Optional. 15 characters."
              label="GST number"
              mono
              onChange={(event) => setPartyGst(event.target.value.toUpperCase())}
              value={partyGst}
            />
            <Textarea
              containerClassName="col-span-2"
              hint="Optional."
              label="Address"
              onChange={(event) => setPartyAddress(event.target.value)}
              rows={2}
              value={partyAddress}
            />
          </div>
        </Section>

        <Section
          icon={<FileText aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Documents"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              hint="Optional."
              label="Invoice number"
              onChange={(event) => setInvoiceNo(event.target.value)}
              value={invoiceNo}
            />
            <Field
              hint="Optional."
              label="Sales order number"
              onChange={(event) => setSalesOrderNo(event.target.value)}
              value={salesOrderNo}
            />
          </div>
        </Section>

        <Section
          icon={<UserCheck aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Handover"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              hint="Who from our side handed it over."
              label="Handed over by"
              onChange={(event) => setHandedOverBy(event.target.value)}
              value={handedOverBy}
            />
            <Field
              hint="Who collected the material."
              label="Received by"
              onChange={(event) => setReceivedBy(event.target.value)}
              value={receivedBy}
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

        {/* DSK-319 — the friendly version. toUserMessage already turns
            "INSUFFICIENT_STOCK: available 1, requested 2" into "Only 1 left in stock."; the
            tone is a warning rather than an error because the server is doing its job, not
            failing. */}
        {saveOutward.error === null ? null : (
          <Alert shake tone={isInsufficientStock(saveOutward.error) ? 'warning' : 'error'}>
            {toUserMessage(saveOutward.error)}
          </Alert>
        )}

        <div className="flex items-center justify-end gap-3 pb-2">
          {/* DSK-320 — disabled while in flight. One click can never become two dispatches. */}
          <Button disabled={!isSaveable} isLoading={saveOutward.isPending} size="lg" type="submit">
            {saveOutward.isPending ? 'Saving…' : 'Save outward'}
          </Button>
        </div>
      </form>
=======
import { useState } from 'react'
import { ArrowUpRight, Scan, AlertTriangle, CheckCircle2, Building2, UserCheck, ShieldAlert, Package } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface ProductItem {
  id: string
  name: string
  barcode: string
  currentStock: number
  availableStock: number
  category: string
}

const DEMO_PRODUCTS: ProductItem[] = [
  { id: '1', name: 'Arduino UNO R3 Board', barcode: 'ST00000001', currentStock: 45, availableStock: 45, category: 'AI Lab' },
  { id: '2', name: 'Servo Motor SG90', barcode: 'ST00000002', currentStock: 120, availableStock: 120, category: 'AI Lab' },
  { id: '3', name: 'RFID RC522 Module', barcode: 'ST00000003', currentStock: 8, availableStock: 8, category: 'AI Lab' },
  { id: '4', name: '64 GB Pen Drive (Std 1-4)', barcode: 'ST00000004', currentStock: 80, availableStock: 80, category: 'Digital Products' }
]

export type OutwardType = 'SALE' | 'DEMO' | 'REPLACEMENT' | 'INTERNAL_USE' | 'SERVICE' | 'SAMPLE'

export function Outward() {
  const [scanQuery, setScanQuery] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [outwardType, setOutwardType] = useState<OutwardType>('SALE')
  const [schoolName, setSchoolName] = useState<string>('')
  const [contactPerson, setContactPerson] = useState<string>('')
  const [mobileNumber, setMobileNumber] = useState<string>('')
  const [handedOverBy, setHandedOverBy] = useState<string>('')
  const [receivedBy, setReceivedBy] = useState<string>('')
  const [isSaved, setIsSaved] = useState<boolean>(false)

  const handleScanOrSearch = (query: string) => {
    setScanQuery(query)
    const match = DEMO_PRODUCTS.find(
      (p) => p.barcode.toLowerCase() === query.trim().toLowerCase() || p.name.toLowerCase().includes(query.trim().toLowerCase())
    )
    if (match) {
      setSelectedProduct(match)
    }
  }

  const isInsufficientStock = selectedProduct ? quantity > selectedProduct.availableStock : false

  const handleSaveOutward = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct || quantity <= 0 || isInsufficientStock) return

    // Reduce stock in demo mode
    selectedProduct.currentStock -= quantity
    selectedProduct.availableStock -= quantity
    setIsSaved(true)
  }

  const handleReset = () => {
    setSelectedProduct(null)
    setScanQuery('')
    setQuantity(1)
    setOutwardType('SALE')
    setSchoolName('')
    setContactPerson('')
    setMobileNumber('')
    setHandedOverBy('')
    setReceivedBy('')
    setIsSaved(false)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowUpRight className="w-6 h-6 text-indigo-600" />
            Outward Dispatch Entry
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dispatch stock to schools or customers, validate stock availability, and post ledger entry.
          </p>
        </div>
      </div>

      {isSaved ? (
        <Card className="p-8 bg-indigo-50/80 border border-indigo-200 text-center space-y-4 rounded-2xl shadow-sm">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-indigo-950">Outward Saved Successfully!</h2>
            <p className="text-xs text-indigo-800 mt-1">
              Dispatched <strong className="font-bold">{quantity}</strong> unit(s) of{' '}
              <strong className="font-bold">{selectedProduct?.name}</strong> for {outwardType}.
            </p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Remaining Available Stock: <span className="font-mono font-bold">{selectedProduct?.availableStock} units</span>
            </p>
          </div>
          <Button onClick={handleReset} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-6 py-2">
            Record Another Outward
          </Button>
        </Card>
      ) : (
        <form onSubmit={handleSaveOutward} className="space-y-6">
          {/* Step 1 & 2: Barcode Scan & Product Display */}
          <Card className="p-5 bg-white border border-slate-200 shadow-sm rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Scan className="w-4 h-4 text-indigo-600" />
              1. Scan Barcode or Select Product
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Scan / Search Barcode</label>
                <input
                  type="text"
                  value={scanQuery}
                  onChange={(e) => handleScanOrSearch(e.target.value)}
                  placeholder="Scan barcode (e.g. ST00000001)..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Picker</label>
                <select
                  value={selectedProduct?.id || ''}
                  onChange={(e) => {
                    const prod = DEMO_PRODUCTS.find((p) => p.id === e.target.value)
                    if (prod) setSelectedProduct(prod)
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Select Product --</option>
                  {DEMO_PRODUCTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.barcode}) - {p.availableStock} available
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product Stock Status Display */}
            {selectedProduct && (
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  selectedProduct.availableStock <= 5
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white text-slate-700 rounded-lg shadow-xs">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{selectedProduct.name}</h3>
                    <p className="text-[11px] text-slate-500 font-mono">Barcode: {selectedProduct.barcode}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Available Quantity</span>
                  <div
                    className={`text-base font-bold font-mono ${
                      selectedProduct.availableStock <= 5 ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  >
                    {selectedProduct.availableStock} units
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Step 3 & 4: Quantity & Outward Type */}
          <Card className="p-5 bg-white border border-slate-200 shadow-sm rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <Building2 className="w-4 h-4 text-indigo-600" />
              2. Quantity & Outward Reason
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dispatch Quantity *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`w-full px-3.5 py-2 bg-white border rounded-xl text-xs font-bold focus:outline-none ${
                    isInsufficientStock
                      ? 'border-rose-500 text-rose-600 focus:ring-rose-500'
                      : 'border-slate-300 text-slate-900 focus:ring-indigo-500'
                  }`}
                />
                {isInsufficientStock && (
                  <p className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Insufficient stock! Only {selectedProduct?.availableStock} unit(s) available.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Outward Type *</label>
                <select
                  value={outwardType}
                  onChange={(e) => setOutwardType(e.target.value as OutwardType)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="SALE">Sale</option>
                  <option value="DEMO">Demo</option>
                  <option value="REPLACEMENT">Replacement</option>
                  <option value="INTERNAL_USE">Internal Use</option>
                  <option value="SERVICE">Service</option>
                  <option value="SAMPLE">Sample</option>
                </select>
              </div>
            </div>

            {/* Step 5: Party / School Details */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <label className="block text-xs font-semibold text-slate-800">School / Customer Information</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">School / Party Name *</label>
                  <input
                    type="text"
                    required
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="e.g. Nashik High School"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Principal Patil"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Mobile Number</label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="e.g. 9822099999"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Handed Over By</label>
                  <input
                    type="text"
                    value={handedOverBy}
                    onChange={(e) => setHandedOverBy(e.target.value)}
                    placeholder="e.g. Ram Store Manager"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Receiver Name</label>
                  <input
                    type="text"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    placeholder="e.g. Teacher Ramesh"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={!selectedProduct || quantity <= 0 || isInsufficientStock || !schoolName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs px-6 py-3 rounded-xl shadow-md"
            >
              Save Outward & Reduce Stock
            </Button>
          </div>
        </form>
      )}
>>>>>>> Stashed changes
    </div>
  )
}
