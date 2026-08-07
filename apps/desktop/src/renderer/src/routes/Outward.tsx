import { ArrowUpFromLine, CheckCircle2, ChevronLeft, FileText, Plus, School, UserCheck, Trash2 } from 'lucide-react'
import { useRef, useState, useEffect, useMemo, type FormEvent, type ReactNode } from 'react'
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
import { useInwardHistory, type InwardHistoryRow } from '@/hooks/useInwardHistory'
import { useProductPicker } from '@/hooks/useProductPicker'
import { useSaveOutward, useDeleteOutward, useDeleteInward, type OutwardType } from '@/hooks/useSaveMovement'
import { useConfirm } from '@/hooks/useConfirm'
import { useAlert } from '@/hooks/useAlert'
import { useCustomers } from '@/hooks/useCustomers'
import { isInsufficientStock, toUserMessage } from '@/lib/errors'
import {
  findGstProblem,
  findMobileProblem,
  findQtyProblem,
  normaliseGst,
  orDash,
  orDateTime,
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
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  const { data: customers } = useCustomers()

  const customerOptions = useMemo(
    () =>
      (customers || []).map((c) => ({
        value: c.id,
        label: c.name,
        description: c.gst_no ? `GST: ${c.gst_no}` : c.mobile || undefined
      })),
    [customers]
  )
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
  const [batchModalData, setBatchModalData] = useState<{ productId: string; productName: string; batchCode: string; documentId: string } | null>(null)
  const [batchOutwardQtys, setBatchOutwardQtys] = useState<Record<string, string>>({})

  function handleBatchQtyChange(batchId: string, val: string, maxQty?: number) {
    const rawVal = val.trim()
    if (rawVal === '') {
      setBatchOutwardQtys((prev) => {
        const next = { ...prev }
        delete next[batchId]
        updateTotalQty(next)
        return next
      })
      return
    }
    let num = parseInt(rawVal, 10)
    if (isNaN(num) || num < 0) num = 0
    if (maxQty !== undefined && num > maxQty) num = maxQty

    setBatchOutwardQtys((prev) => {
      const next = { ...prev, [batchId]: String(num) }
      updateTotalQty(next)
      return next
    })
  }

  function updateTotalQty(qtys: Record<string, string>) {
    let total = 0
    for (const key in qtys) {
      total += parseInt(qtys[key] || '0', 10)
    }
    setQty(total > 0 ? String(total) : '')
  }

  const historyProductId = historyFilter === 'product' ? picker.picked?.id : undefined
  const { data: outwardHistoryData, isLoading: outwardHistoryLoading, error: outwardHistoryError } =
    useOutwardHistory(historyProductId)

  const processedOutwardData = useMemo(() => {
    if (!outwardHistoryData) return []
    const clonedData = outwardHistoryData.map((row) => ({ ...row }))
    // "Total Quantity" is the product's total dispatched quantity across every batch —
    // the same figure on each of that product's rows, NOT a per-row running sum.
    const totalOutByProduct: Record<string, number> = {}
    for (const row of clonedData) {
      totalOutByProduct[row.product_id] = (totalOutByProduct[row.product_id] ?? 0) + row.outward_qty
    }
    for (const row of clonedData) {
      row.total_qty = totalOutByProduct[row.product_id] ?? 0
    }
    return clonedData
  }, [outwardHistoryData])

  const historyLoading = outwardHistoryLoading
  const historyError = outwardHistoryError
  const historyCount = outwardHistoryData?.length ?? 0

  const { data: formInwardData, isLoading: formInwardLoading } = useInwardHistory(
    showForm && picker.picked ? picker.picked.id : null
  )

  useEffect(() => {
    setBatchSelection(null)
    setBatchOutwardQtys({})
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
    setSelectedCustomerId('')
    setInvoiceNo('')
    setSalesOrderNo('')
    setHandedOverBy('')
    setReceivedBy('')
    setDeliveryMethod('')
    setNotes('')
    setBatchSelection(null)
    setBatchOutwardQtys({})
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

    const batchesPayload: { batch_id: string | null; qty: number }[] = []
    const genericQty = parseInt(batchOutwardQtys['generic'] || '0', 10)
    if (genericQty > 0) {
      batchesPayload.push({
        batch_id: '00000000-0000-0000-0000-000000000000',
        qty: genericQty
      })
    }
    for (const key in batchOutwardQtys) {
      if (key !== 'generic') {
        const bQty = parseInt(batchOutwardQtys[key] || '0', 10)
        if (bQty > 0) {
          batchesPayload.push({
            batch_id: key,
            qty: bQty
          })
        }
      }
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
        batchId: null,
        batches: batchesPayload.length > 0 ? batchesPayload : null
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
    const isStockTab = historyTab === 'stock'
    const stockColumns: Column<OutwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => <span className="whitespace-nowrap">{row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—'}</span> },
      {
        header: 'Product',
        cell: (row) => (
          <button
            className="font-medium text-primary transition-colors hover:text-primary-focus hover:underline text-left"
            onClick={() => {
              picker.choose(row.product_id)
              setHistoryFilter('product')
            }}
          >
            {row.product_name}
          </button>
        )
      },
      {
        header: 'Batch',
        cell: (row) =>
          row.batch_code ? (
            <button
              className="font-medium text-primary transition-colors hover:text-primary-focus hover:underline whitespace-nowrap"
              onClick={() =>
                setBatchModalData({
                  productId: row.product_id,
                  productName: row.product_name,
                  batchCode: row.batch_code!,
                  documentId: row.id
                })
              }
            >
              {row.batch_code}
            </button>
          ) : (
            '—'
          )
      },
      {
        header: 'Status',
        cell: (row) =>
          row.remaining_qty > 0 ? (
            <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-body-sm font-medium text-success whitespace-nowrap">
              In Stock
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-on-surface/[0.06] px-2.5 py-0.5 text-body-sm font-medium text-on-surface-variant whitespace-nowrap">
              Fully Outwarded
            </span>
          )
      },
      { header: 'Type', cell: (row) => <span className="whitespace-nowrap">{outwardTypeLabel(row.outward_type)}</span> },
      { header: 'Qty Given', align: 'right', cell: (row) => row.outward_qty },
      { header: 'Remaining Qty', align: 'right', cell: (row) => row.remaining_qty },
      { header: 'Total Qty', align: 'right', cell: (row) => row.total_qty },
      { header: 'Inwarded', cell: (row) => <span className="whitespace-nowrap">{orDateTime(row.inwarded_at)}</span> },
      { header: 'Outwarded', cell: (row) => <span className="whitespace-nowrap">{orDateTime(row.outwarded_at)}</span> },
      { header: 'Scanned By', cell: (row) => <span className="whitespace-nowrap">{orDash(row.scanned_by)}</span> },
      { header: 'Scanned At', cell: (row) => <span className="whitespace-nowrap">{orDash(row.scanned_at_office)}</span> },
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
            className="p-1 transition-colors text-on-surface-variant hover:text-error disabled:opacity-50"
            title="Delete outward entry"
          >
            <Trash2 aria-hidden="true" className="size-4.5" />
          </button>
        )
      }
    ]

    const partyColumns: Column<OutwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => <span className="whitespace-nowrap">{row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—'}</span> },
      {
        header: 'Product',
        cell: (row) => (
          <button
            className="font-medium text-primary transition-colors hover:text-primary-focus hover:underline text-left"
            onClick={() => {
              picker.choose(row.product_id)
              setHistoryFilter('product')
            }}
          >
            {row.product_name}
          </button>
        )
      },
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
            className="p-1 transition-colors text-on-surface-variant hover:text-error disabled:opacity-50"
            title="Delete outward entry"
          >
            <Trash2 aria-hidden="true" className="size-4.5" />
          </button>
        )
      }
    ]

    const otherColumns: Column<OutwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => <span className="whitespace-nowrap">{row.issued_at ? new Date(row.issued_at).toLocaleDateString() : '—'}</span> },
      {
        header: 'Product',
        cell: (row) => (
          <button
            className="font-medium text-primary transition-colors hover:text-primary-focus hover:underline text-left"
            onClick={() => {
              picker.choose(row.product_id)
              setHistoryFilter('product')
            }}
          >
            {row.product_name}
          </button>
        )
      },
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
            className="p-1 transition-colors text-on-surface-variant hover:text-error disabled:opacity-50"
            title="Delete outward entry"
          >
            <Trash2 aria-hidden="true" className="size-4.5" />
          </button>
        )
      }
    ]

    return (
      <div className="flex flex-col gap-gutter">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-h1 text-on-surface">Outward</h1>
            <p className="text-body-sm text-on-surface-variant/60">
              {historyLoading ? 'Loading…' : `${historyCount} recent outward entries`}
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
          {isStockTab ? (
            <DataTable<OutwardHistoryRow>
              columns={stockColumns}
              data={processedOutwardData}
              isLoading={outwardHistoryLoading}
              error={outwardHistoryError ? toUserMessage(outwardHistoryError) : undefined}
              emptyMessage="No stock entries yet."
              rowClassName={(row) =>
                row.remaining_qty > 0
                  ? 'bg-on-surface/[0.02] hover:bg-on-surface/[0.05]'
                  : 'bg-on-surface/[0.01] hover:bg-on-surface/[0.03]'
              }
            />
          ) : (
            <DataTable<OutwardHistoryRow>
              columns={historyTab === 'party' ? partyColumns : otherColumns}
              data={processedOutwardData}
              isLoading={outwardHistoryLoading}
              error={outwardHistoryError ? toUserMessage(outwardHistoryError) : undefined}
              emptyMessage="No outward entries yet."
            />
          )}
        </Card>

        {batchModalData && (
          <BatchBarcodesModal
            productId={batchModalData.productId}
            productName={batchModalData.productName}
            batchCode={batchModalData.batchCode}
            scanContext="OUTWARD"
            documentId={batchModalData.documentId}
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
                label="Quantity to give out (sum of batches below)"
                min={1}
                readOnly
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
              <div className="flex flex-col gap-2 mt-4">
                <h3 className="text-body-sm font-semibold text-on-surface">Select Batch Allocations</h3>
                {formInwardLoading ? (
                  <p className="text-body-sm text-on-surface-variant/60">Loading available batches...</p>
                ) : (
                  <div className="border border-outline-variant rounded-xl overflow-hidden">
                    <table className="w-full border-collapse text-left text-body-sm">
                      <thead>
                        <tr className="bg-on-surface/[0.03] hairline-b text-label-caps">
                          <th className="px-4 py-2 text-on-surface-variant/70 uppercase">Date</th>
                          <th className="px-4 py-2 text-on-surface-variant/70 uppercase">Batch</th>
                          <th className="px-4 py-2 text-on-surface-variant/70 uppercase text-right">Inward Qty</th>
                          <th className="px-4 py-2 text-on-surface-variant/70 uppercase text-right">Remaining</th>
                          <th className="px-4 py-2 text-on-surface-variant/70 uppercase">Brought By</th>
                          <th className="px-4 py-2 text-on-surface-variant/70 uppercase text-center w-32">Outward Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Generic / No Batch Row */}
                        <tr className="hairline-b hover:bg-on-surface/[0.02] h-row">
                          <td className="px-4 text-on-surface-variant">—</td>
                          <td className="px-4 font-medium text-on-surface">Generic / No Batch</td>
                          <td className="px-4 text-right text-on-surface-variant">—</td>
                          <td className="px-4 text-right text-on-surface-variant">—</td>
                          <td className="px-4 text-on-surface-variant">—</td>
                          <td className="px-4 py-1 text-center">
                            <input
                              className="w-24 text-right border border-outline-variant bg-surface-container-lowest text-on-surface rounded px-2 py-1 focus:border-primary transition-all"
                              type="number"
                              min={0}
                              value={batchOutwardQtys['generic'] || ''}
                              placeholder="0"
                              onChange={(e) => handleBatchQtyChange('generic', e.target.value)}
                            />
                          </td>
                        </tr>
                        {/* Batches with stock */}
                        {formInwardData && formInwardData.filter(b => b.remaining_qty > 0 && b.batch_id).map((row) => (
                          <tr key={row.id} className="hairline-b hover:bg-on-surface/[0.02] h-row">
                            <td className="px-4 text-on-surface">{new Date(row.received_at).toLocaleDateString()}</td>
                            <td className="px-4 font-semibold text-primary">{row.batch_code || '—'}</td>
                            <td className="px-4 text-right text-on-surface">{row.inward_qty}</td>
                            <td className="px-4 text-right text-success font-semibold">{row.remaining_qty}</td>
                            <td className="px-4 text-on-surface">{row.brought_by || '—'}</td>
                            <td className="px-4 py-1 text-center">
                              <input
                                className="w-24 text-right border border-outline-variant bg-surface-container-lowest text-on-surface rounded px-2 py-1 focus:border-primary transition-all font-semibold"
                                type="number"
                                min={0}
                                max={row.remaining_qty}
                                value={row.batch_id ? (batchOutwardQtys[row.batch_id] || '') : ''}
                                placeholder="0"
                                onChange={(e) => handleBatchQtyChange(row.batch_id || '', e.target.value, row.remaining_qty)}
                              />
                            </td>
                          </tr>
                        ))}
                        {(!formInwardData || formInwardData.filter(b => b.remaining_qty > 0 && b.batch_id).length === 0) && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant/60">
                              No active batches with stock found. You can dispatch from "Generic / No Batch".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) /* replaced BatchPicker */ }

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
            <div className="col-span-2">
              <Select
                label="Select Existing Party (Optional)"
                placeholder="Choose a school / customer to autofill their details..."
                options={customerOptions}
                value={selectedCustomerId}
                onChange={(val) => {
                  setSelectedCustomerId(val)
                  const customer = customers?.find((c) => c.id === val)
                  if (customer) {
                    setPartyName(customer.name)
                    setContactPerson(customer.contact_person || '')
                    setMobile(customer.mobile || '')
                    setPartyGst(customer.gst_no || '')
                    setPartyAddress(customer.address || '')
                  } else {
                    setPartyName('')
                    setContactPerson('')
                    setMobile('')
                    setPartyGst('')
                    setPartyAddress('')
                  }
                }}
              />
            </div>
            <Field
              error={errors.partyName}
              hint="Reused if this school already exists."
              label="School / customer name"
              onChange={(event) => {
                setPartyName(event.target.value)
                setSelectedCustomerId('')
              }}
              required={outwardType === 'SALE'}
              value={partyName}
            />
            <Field
              hint="Optional."
              label="Contact person"
              onChange={(event) => {
                setContactPerson(event.target.value)
                setSelectedCustomerId('')
              }}
              value={contactPerson}
            />
            <Field
              error={errors.mobile}
              hint="Optional. 10 digits."
              inputMode="numeric"
              label="Mobile number"
              onChange={(event) => {
                setMobile(event.target.value)
                setSelectedCustomerId('')
              }}
              value={mobile}
            />
            <Field
              error={errors.partyGst}
              hint="Optional. 15 characters."
              label="GST number"
              mono
              onChange={(event) => {
                setPartyGst(event.target.value.toUpperCase())
                setSelectedCustomerId('')
              }}
              value={partyGst}
            />
            <Textarea
              containerClassName="col-span-2"
              hint="Optional."
              label="Address"
              onChange={(event) => {
                setPartyAddress(event.target.value)
                setSelectedCustomerId('')
              }}
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
