import { ArrowUpFromLine, CheckCircle2, ChevronLeft, FileText, Plus, School, UserCheck, Trash2 } from 'lucide-react'
import { useRef, useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { BatchPicker, type BatchSelection } from '@/components/movement/BatchPicker'
import { BatchBarcodesModal } from '@/components/barcode/BatchBarcodesModal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field } from '@/components/ui/Field'
import { HistoryTab } from '@/components/ui/HistoryTab'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useOutwardHistory, type OutwardHistoryRow } from '@/hooks/useOutwardHistory'
import { useProductPicker } from '@/hooks/useProductPicker'
import { useSaveOutward, useDeleteOutward, type OutwardType } from '@/hooks/useSaveMovement'
import { useConfirm } from '@/hooks/useConfirm'
import { useAlert } from '@/hooks/useAlert'
import { isInsufficientStock, toUserMessage } from '@/lib/errors'
import {
  findGstProblem,
  findMobileProblem,
  findQtyProblem,
  normaliseGst,
  orDash,
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

/** Friendly label for an outward_type code, for the history table. */
function outwardTypeLabel(value: string): string {
  return OUTWARD_TYPES.find((t) => t.value === value)?.label ?? value
}

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
  const deleteOutward = useDeleteOutward()
  const confirm = useConfirm()
  const showAlert = useAlert()

  async function handleDelete(row: OutwardHistoryRow) {
    const ok = await confirm({
      title: 'Delete Outward Entry',
      description: `Are you sure you want to delete outward entry of ${row.outward_qty} x "${row.product_name}" from ${row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—'}?\n\nStock balance will be restored automatically.`,
      confirmText: 'Delete Outward Entry'
    })
    if (!ok) return
    try {
      await deleteOutward.mutateAsync(row.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete outward entry.'
      void showAlert({
        title: msg.includes('Cannot delete') ? 'Cannot Delete Item' : 'Action Failed',
        description: msg,
        tone: 'warning'
      })
    }
  }

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
  const [showForm, setShowForm] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'product'>('all')
  const [historyTab, setHistoryTab] = useState<'stock' | 'party' | 'other'>('stock')
  const [batchModalData, setBatchModalData] = useState<{ productId: string; productName: string; batchCode: string } | null>(null)

  const historyProductId = historyFilter === 'product' ? picker.picked?.id : undefined
  const { data: historyData, isLoading: historyLoading, error: historyError } =
    useOutwardHistory(historyProductId)

  useEffect(() => {
    setBatchSelection(null)
  }, [picker.picked?.id])

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

  // Landing list + tabbed history, mirroring Inward. Same rows (one per Date + Product +
  // Batch), three column sets: what left and from which batch / who received it / the rest.
  if (!showForm && saved === null) {
    const stockColumns: Column<OutwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => (row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—') },
      { header: 'Product', cell: (row) => row.product_name },
      {
        header: 'Batch',
        cell: (row) =>
          row.batch_code ? (
            <button
              className="font-medium text-primary transition-colors hover:text-primary-focus hover:underline"
              onClick={() =>
                setBatchModalData({
                  productId: row.product_id,
                  productName: row.product_name,
                  batchCode: row.batch_code!
                })
              }
            >
              {row.batch_code}
            </button>
          ) : (
            '—'
          )
      },
      { header: 'Type', cell: (row) => outwardTypeLabel(row.outward_type) },
      { header: 'Quantity (given out)', align: 'right', cell: (row) => row.outward_qty },
      { header: 'Remaining Quantity', align: 'right', cell: (row) => row.remaining_qty },
      { header: 'Total Quantity', align: 'right', cell: (row) => row.total_qty },
      {
        header: 'Actions',
        align: 'right',
        width: 'w-20',
        cell: (row) => (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleDelete(row)
            }}
            disabled={deleteOutward.isPending}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            title="Delete outward entry"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )
      }
    ]

    const partyColumns: Column<OutwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => (row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—') },
      { header: 'Product', cell: (row) => row.product_name },
      { header: 'School / Party', cell: (row) => orDash(row.party_name) },
      { header: 'Contact', cell: (row) => orDash(row.contact_person) },
      { header: 'Mobile', cell: (row) => orDash(row.party_mobile) },
      { header: 'GST No', cell: (row) => orDash(row.party_gst) },
      { header: 'Invoice No', cell: (row) => orDash(row.invoice_no) },
      { header: 'SO No', cell: (row) => orDash(row.sales_order_no) },
      { header: 'Address', cell: (row) => orDash(row.party_address) },
      {
        header: 'Actions',
        align: 'right',
        width: 'w-20',
        cell: (row) => (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleDelete(row)
            }}
            disabled={deleteOutward.isPending}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            title="Delete outward entry"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )
      }
    ]

    const otherColumns: Column<OutwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => (row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—') },
      { header: 'Product', cell: (row) => row.product_name },
      { header: 'Type', cell: (row) => outwardTypeLabel(row.outward_type) },
      { header: 'Handed Over By', cell: (row) => orDash(row.handed_over_by) },
      { header: 'Received By', cell: (row) => orDash(row.received_by) },
      { header: 'Delivery Method', cell: (row) => orDash(row.delivery_method) },
      { header: 'Notes', cell: (row) => orDash(row.notes) },
      {
        header: 'Actions',
        align: 'right',
        width: 'w-20',
        cell: (row) => (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleDelete(row)
            }}
            disabled={deleteOutward.isPending}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            title="Delete outward entry"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )
      }
    ]

    const columns =
      historyTab === 'stock' ? stockColumns : historyTab === 'party' ? partyColumns : otherColumns

    return (
      <div className="flex flex-col gap-gutter">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-h1 text-on-surface">Outward</h1>
            <p className="text-body-sm text-on-surface-variant/60">
              {historyLoading ? 'Loading…' : `${historyData?.length ?? 0} recent outward entries`}
            </p>
          </div>
          <Button
            icon={<Plus aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
            onClick={() => setShowForm(true)}
          >
            Generate Outward entry
          </Button>
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 hairline-b px-2 py-2">
            <div className="flex gap-1" role="tablist" aria-label="Outward history view">
              <HistoryTab active={historyTab === 'stock'} onClick={() => setHistoryTab('stock')}>
                Stock &amp; Batches
              </HistoryTab>
              <HistoryTab active={historyTab === 'party'} onClick={() => setHistoryTab('party')}>
                Party
              </HistoryTab>
              <HistoryTab active={historyTab === 'other'} onClick={() => setHistoryTab('other')}>
                Other Details
              </HistoryTab>
            </div>
            <div className="flex gap-2 pr-2">
              <Button
                size="sm"
                variant={historyFilter === 'all' ? 'primary' : 'secondary'}
                onClick={() => setHistoryFilter('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={historyFilter === 'product' ? 'primary' : 'secondary'}
                onClick={() => setHistoryFilter('product')}
                disabled={!picker.picked}
              >
                Selected Product
              </Button>
            </div>
          </div>
          <DataTable<OutwardHistoryRow>
            columns={columns}
            data={historyData}
            isLoading={historyLoading}
            error={historyError ? toUserMessage(historyError) : undefined}
            emptyMessage="No outward entries yet."
          />
        </Card>

        {batchModalData && (
          <BatchBarcodesModal
            productId={batchModalData.productId}
            productName={batchModalData.productName}
            batchCode={batchModalData.batchCode}
            onClose={() => setBatchModalData(null)}
          />
        )}
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
      <div className="flex items-start gap-4">
        <Button
          variant="secondary"
          icon={<ChevronLeft className="size-[18px]" />}
          onClick={() => setShowForm(false)}
        >
          Back
        </Button>
        <div>
          <h1 className="text-h1 text-on-surface">Generate Outward Entry</h1>
          <p className="text-body-sm text-on-surface-variant/60">Give out or sell stock.</p>
        </div>
      </div>

      <form className="flex flex-col gap-gutter" noValidate onSubmit={handleSubmit} ref={formRef}>
        <Section
          icon={
            <ArrowUpFromLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          title="Product"
        >
          <div className="flex flex-col gap-4">
            <ProductPicker emphasiseStock hideScanner picker={picker} />

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
