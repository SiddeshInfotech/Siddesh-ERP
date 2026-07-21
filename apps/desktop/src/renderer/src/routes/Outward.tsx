import { ArrowUpFromLine, CheckCircle2, FileText, School, UserCheck } from 'lucide-react'
import { useRef, useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { BatchPicker, type BatchSelection } from '@/components/movement/BatchPicker'
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
  const [deliveryMethod, setDeliveryMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [batchSelection, setBatchSelection] = useState<BatchSelection | null>(null)

  useEffect(() => {
    // No auto-select, wait for explicit
    if (!picker.picked) {
      setBatchSelection(null)
    }
  }, [picker.picked])

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
    setDeliveryMethod('')
    setNotes('')
    setBatchSelection(null)
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
        deliveryMethod: orNull(deliveryMethod),
        notes: orNull(notes),
        batchId: batchSelection?.batchId || null
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
            
            {picker.picked && (
              <BatchPicker 
                productId={picker.picked.id} 
                qty={Number(qty) || 0}
                value={batchSelection} 
                onChange={setBatchSelection} 
                allowCreate={false}
              />
            )}

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
            <Field
              containerClassName="col-span-2"
              hint="e.g. By Road, Courier, Train, Air"
              label="Delivery Method"
              onChange={(event) => setDeliveryMethod(event.target.value)}
              value={deliveryMethod}
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
    </div>
  )
}
