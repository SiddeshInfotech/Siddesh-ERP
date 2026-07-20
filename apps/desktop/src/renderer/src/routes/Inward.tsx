import { ArrowDownToLine, CheckCircle2, FileText, Truck, User } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePicker } from '@/components/ui/DatePicker'
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
            <DatePicker
              hint="Optional."
              label="Invoice date"
              onChange={setInvoiceDate}
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
    </div>
  )
}
