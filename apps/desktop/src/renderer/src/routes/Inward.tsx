import { ArrowDownToLine, CheckCircle2, FileText, Truck, User, Plus, ChevronLeft } from 'lucide-react'
import { useRef, useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { ProductPicker } from '@/components/movement/ProductPicker'
import { BatchBarcodesModal } from '@/components/barcode/BatchBarcodesModal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePicker } from '@/components/ui/DatePicker'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { BatchPicker, type BatchSelection } from '@/components/movement/BatchPicker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useInwardHistory, type InwardHistoryRow } from '@/hooks/useInwardHistory'
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
  const [batchSelection, setBatchSelection] = useState<BatchSelection | null>(null)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'product'>('all')
  const [showForm, setShowForm] = useState(false)
  const [batchModalData, setBatchModalData] = useState<{ productId: string; productName: string; batchCode: string } | null>(null)
  
  useEffect(() => {
    // We do not auto-fill batch selection anymore based on picker picked because 
    // we want explicit batch selection/creation for Inward
    if (!picker.picked) {
      setBatchSelection(null)
    }
  }, [picker.picked])

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
    if (qtyProblem !== null) found.qty = qtyProblem

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
          <div className="flex items-end gap-3 hairline-b p-4">
            <div className="flex flex-col">
              <label className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant">
                History Filter
              </label>
              <div className="flex gap-2">
                <Button
                  variant={historyFilter === 'all' ? 'primary' : 'outline'}
                  onClick={() => setHistoryFilter('all')}
                >
                  All
                </Button>
                <Button
                  variant={historyFilter === 'product' ? 'primary' : 'outline'}
                  onClick={() => setHistoryFilter('product')}
                  disabled={!picker.picked}
                >
                  Selected Product
                </Button>
              </div>
            </div>
          </div>
          <DataTable<InwardHistoryRow>
            columns={[
              {
                header: 'Date',
                cell: (row) => new Date(row.received_at).toLocaleDateString()
              },
              {
                header: 'Product',
                cell: (row) => row.product_name
              },
              {
                header: 'Batch',
                cell: (row) => 
                  row.batch_code ? (
                    <button
                      onClick={() => setBatchModalData({ productId: row.product_id, productName: row.product_name, batchCode: row.batch_code! })}
                      className="text-primary hover:underline hover:text-primary-focus font-medium transition-colors"
                    >
                      {row.batch_code}
                    </button>
                  ) : '—'
              },
              {
                header: 'Quantity (on that batch)',
                align: 'right',
                cell: (row) => row.inward_qty
              },
              {
                header: 'Remaining Quantity',
                align: 'right',
                cell: (row) => row.remaining_qty
              },
              {
                header: 'Total Quantity',
                align: 'right',
                cell: (row) => row.total_qty
              },
              {
                header: 'Brought By',
                cell: (row) => row.brought_by || '—'
              }
            ]}
            data={historyData}
            isLoading={historyLoading}
            error={historyError ? toUserMessage(historyError) : undefined}
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
        <Button variant="outline" icon={<ChevronLeft className="size-[18px]" />} onClick={() => setShowForm(false)}>
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
              hint="How many units arrived."
              inputMode="numeric"
              label="Quantity received"
              min={1}
              onChange={(event) => setQty(event.target.value)}
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
