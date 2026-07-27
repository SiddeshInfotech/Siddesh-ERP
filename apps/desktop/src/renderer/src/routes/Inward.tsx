import { ArrowDownToLine, CheckCircle2, FileText, Truck, User, Plus, ChevronLeft, Trash2 } from 'lucide-react'
import { useRef, useState, useEffect, useMemo, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { BatchBarcodesModal } from '@/components/barcode/BatchBarcodesModal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePicker } from '@/components/ui/DatePicker'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { HistoryTab } from '@/components/ui/HistoryTab'
import { BatchPicker, type BatchSelection } from '@/components/movement/BatchPicker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useInwardHistory, type InwardHistoryRow } from '@/hooks/useInwardHistory'
import { useProductPicker } from '@/hooks/useProductPicker'
import { useSaveInward, useDeleteInward } from '@/hooks/useSaveMovement'
import { useConfirm } from '@/hooks/useConfirm'
import { useAlert } from '@/hooks/useAlert'
import { useSuppliers } from '@/hooks/useSuppliers'
import { toUserMessage } from '@/lib/errors'
import {
  findGstProblem,
  findMobileProblem,
  findQtyProblem,
  normaliseGst,
  orDash,
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
  const deleteInward = useDeleteInward()
  const confirm = useConfirm()
  const showAlert = useAlert()

  async function handleDelete(row: InwardHistoryRow) {
    const ok = await confirm({
      title: 'Delete Inward Entry',
      description: `Are you sure you want to delete inward entry of ${row.inward_qty} x "${row.product_name}" from ${new Date(row.received_at).toLocaleDateString()}?\n\nStock balance will be adjusted automatically.`,
      confirmText: 'Delete Inward Entry'
    })
    if (!ok) return
    try {
      await deleteInward.mutateAsync(row.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete inward entry.'
      void showAlert({
        title: msg.includes('Cannot delete') ? 'Cannot Delete Item' : 'Action Failed',
        description: msg,
        tone: 'warning'
      })
    }
  }

  const [qty, setQty] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierMobile, setSupplierMobile] = useState('')
  const [supplierGst, setSupplierGst] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')

  const { data: suppliers } = useSuppliers()

  const supplierOptions = useMemo(() => {
    return (suppliers || []).map((s) => ({
      value: s.id,
      label: s.name,
      description: s.gst_no ? `GST: ${s.gst_no}` : undefined
    }))
  }, [suppliers])

  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [purchaseOrder, setPurchaseOrder] = useState('')
  const [broughtBy, setBroughtBy] = useState('')
  const [notes, setNotes] = useState('')
  const [batchSelection, setBatchSelection] = useState<BatchSelection | null>(null)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'product'>('all')
  const [historyTab, setHistoryTab] = useState<'stock' | 'supplier'>('stock')
  const [showForm, setShowForm] = useState(false)
  const [batchModalData, setBatchModalData] = useState<{ productId: string; productName: string; batchCode: string } | null>(null)

  useEffect(() => {
    setBatchSelection(null)
  }, [picker.picked?.id])

  // Automatically sync Quantity received from selected batch barcodes
  useEffect(() => {
    if (batchSelection && batchSelection.barcodes && batchSelection.barcodes.length > 0) {
      setQty(String(batchSelection.barcodes.length))
    }
  }, [batchSelection])

  const { session } = useAuth()

  const historyProductId = historyFilter === 'product' ? picker.picked?.id : undefined
  const { data: historyData, isLoading: historyLoading, error: historyError } = useInwardHistory(historyProductId)

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
    setBatchSelection(null)
    setInvoiceFile(null)
    setErrors({})
    setSaved(null)
    // A new submission is a new transaction, so it gets a new id. This is the ONLY place a
    // second id is minted.
    clientTxnId.current = crypto.randomUUID()
  }

  function validate(): Errors {
    const found: Errors = {}

    const qtyProblem = findQtyProblem(qty)
    if (qtyProblem !== null) {
      found.qty = qtyProblem
    } else if (batchSelection && batchSelection.barcodes && batchSelection.barcodes.length > 0) {
      if (batchSelection.barcodes.length !== Number(qty)) {
        found.qty = `Quantity (${qty}) must match the number of generated barcodes (${batchSelection.barcodes.length}). Regenerate barcodes to match.`
      }
    }

    if (supplierName.trim().length === 0) found.supplierName = 'Enter the supplier name.'

    const mobileProblem = findMobileProblem(supplierMobile)
    if (mobileProblem !== null) found.supplierMobile = mobileProblem

    const gstProblem = findGstProblem(supplierGst)
    if (gstProblem !== null) found.supplierGst = gstProblem

    return found
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (picker.picked === null) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    let invoiceFilePath = null
    if (invoiceFile && session?.user.id) {
      try {
        const { data: profile } = await supabase.from('profiles').select('office_id').eq('id', session.user.id).single()
        if (profile?.office_id) {
          const ext = invoiceFile.name.split('.').pop()
          const fileName = `${profile.office_id}/${crypto.randomUUID()}.${ext}`
          const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, invoiceFile)
          if (uploadError) throw uploadError
          invoiceFilePath = fileName
        } else {
          throw new Error("You must be assigned to an office to upload invoices.")
        }
      } catch (err: any) {
        console.error("Upload error details:", err)
        const errMsg = err.message || 'Failed to upload invoice file.'
        setErrors({ ...found, supplierName: `Upload Error: ${errMsg}` })
        return
      }
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
        notes: orNull(notes),
        batchId: batchSelection?.batchId || null,
        batchCode: batchSelection?.batchCode || null,
        barcodes: batchSelection?.barcodes || null,
        invoiceFilePath: invoiceFilePath || null
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

  if (!showForm && saved === null) {
    // Two views over the same inward rows (grain: one row per Date + Product + Batch).
    // The stock tab answers "how much and which batch"; the supplier tab answers
    // "who supplied it and how it arrived".
    const stockColumns: Column<InwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => new Date(row.received_at).toLocaleDateString() },
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
      { header: 'Quantity (on that batch)', align: 'right', cell: (row) => row.inward_qty },
      { header: 'Remaining Quantity', align: 'right', cell: (row) => row.remaining_qty },
      { header: 'Total Quantity', align: 'right', cell: (row) => row.total_qty },
      { header: 'Brought By', cell: (row) => orDash(row.brought_by) },
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
            disabled={deleteInward.isPending}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            title="Delete inward entry"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )
      }
    ]

    const supplierColumns: Column<InwardHistoryRow>[] = [
      { header: 'Date', cell: (row) => new Date(row.received_at).toLocaleDateString() },
      { header: 'Product', cell: (row) => row.product_name },
      { header: 'Supplier', cell: (row) => orDash(row.supplier_name) },
      { header: 'Mobile', cell: (row) => orDash(row.supplier_mobile) },
      { header: 'GST No', cell: (row) => orDash(row.supplier_gst) },
      { header: 'Invoice No', cell: (row) => orDash(row.invoice_no) },
      {
        header: 'Invoice Date',
        cell: (row) => (row.invoice_date ? new Date(row.invoice_date).toLocaleDateString() : '—')
      },
      { header: 'PO No', cell: (row) => orDash(row.purchase_order_no) },
      { header: 'Brought By', cell: (row) => orDash(row.brought_by) },
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
            disabled={deleteInward.isPending}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            title="Delete inward entry"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )
      }
    ]

    return (
      <div className="flex flex-col gap-gutter">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-h1 text-on-surface">Inwards</h1>
            <p className="text-body-sm text-on-surface-variant/60">
              {historyLoading ? 'Loading…' : `${historyData?.length ?? 0} recent inward entries`}
            </p>
          </div>
          <Button
            icon={<Plus aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
            onClick={() => setShowForm(true)}
          >
            Generate Inward entry
          </Button>
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 hairline-b px-2 py-2">
            <div className="flex gap-1" role="tablist" aria-label="Inward history view">
              <HistoryTab active={historyTab === 'stock'} onClick={() => setHistoryTab('stock')}>
                Stock &amp; Batches
              </HistoryTab>
              <HistoryTab active={historyTab === 'supplier'} onClick={() => setHistoryTab('supplier')}>
                Supplier &amp; Delivery
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
          <DataTable<InwardHistoryRow>
            columns={historyTab === 'stock' ? stockColumns : supplierColumns}
            data={historyData}
            isLoading={historyLoading}
            error={historyError ? toUserMessage(historyError) : undefined}
            emptyMessage="No inward entries yet."
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

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-start gap-4">
        <Button variant="secondary" icon={<ChevronLeft className="size-[18px]" />} onClick={() => setShowForm(false)}>
          Back
        </Button>
        <div>
          <h1 className="text-h1 text-on-surface">Generate Inward Entry</h1>
          <p className="text-body-sm text-on-surface-variant/60">Receive stock into the store.</p>
        </div>
      </div>

      <form className="flex flex-col gap-gutter" noValidate onSubmit={handleSubmit} ref={formRef}>
        <Section
          icon={
            <ArrowDownToLine aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />
          }
          title="Product"
        >
          <div className="flex flex-col gap-4">
            <ProductPicker picker={picker} hideScanner />

            <Field
              containerClassName="max-w-xs"
              error={errors.qty}
              hint={
                batchSelection && batchSelection.barcodes && batchSelection.barcodes.length > 0
                  ? `Autofilled from selected batch (${batchSelection.barcodes.length} pre-generated barcodes).`
                  : "How many units arrived."
              }
              inputMode="numeric"
              label="Quantity received"
              min={1}
              onChange={(event) => setQty(event.target.value)}
              readOnly={Boolean(batchSelection && batchSelection.barcodes && batchSelection.barcodes.length > 0)}
              required
              type="number"
              value={qty}
            />
            {picker.picked && (
              <BatchPicker
                productId={picker.picked.id}
                qty={Number(qty) || 0}
                value={batchSelection}
                onChange={setBatchSelection}
                allowCreate={true}
              />
            )}
          </div>
        </Section>

        <Section
          icon={<User aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
          title="Supplier"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Select
                label="Select Existing Supplier (Optional)"
                placeholder="Choose a supplier to autofill their details..."
                options={supplierOptions}
                value={selectedSupplierId}
                onChange={(val) => {
                  setSelectedSupplierId(val)
                  const supplier = suppliers?.find((s) => s.id === val)
                  if (supplier) {
                    setSupplierName(supplier.name)
                    setSupplierMobile(supplier.mobile || '')
                    setSupplierGst(supplier.gst_no || '')
                  } else {
                    setSupplierName('')
                    setSupplierMobile('')
                    setSupplierGst('')
                  }
                }}
              />
            </div>
            <Field
              error={errors.supplierName}
              hint="Reused if this supplier already exists."
              label="Supplier name"
              onChange={(event) => {
                setSupplierName(event.target.value)
                setSelectedSupplierId('')
              }}
              required
              value={supplierName}
            />
            <Field
              error={errors.supplierMobile}
              hint="Optional. 10 digits."
              inputMode="numeric"
              label="Supplier mobile"
              onChange={(event) => {
                setSupplierMobile(event.target.value)
                setSelectedSupplierId('')
              }}
              value={supplierMobile}
            />
            <Field
              containerClassName="col-span-2"
              error={errors.supplierGst}
              hint="Optional. 15 characters, e.g. 27AAAAA0000A1Z5."
              label="GST number"
              mono
              onChange={(event) => {
                setSupplierGst(event.target.value.toUpperCase())
                setSelectedSupplierId('')
              }}
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
            <div className="col-span-3">
              <label className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant">
                Invoice PDF
              </label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                className="w-full text-body-md text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-container file:text-on-primary-container hover:file:bg-primary/10"
              />
            </div>
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
