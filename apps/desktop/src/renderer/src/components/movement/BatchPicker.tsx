import { useState, useMemo, type FormEvent, useEffect } from 'react'
import { Plus, ScanLine } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { useBatches, useLastBarcode } from '@/hooks/useBatches'
import { useBatchBarcodes } from '@/hooks/useBatchBarcodes'
import { Alert } from '@/components/ui/Alert'
import { toUserMessage } from '@/lib/errors'
import { InwardBarcodeGeneratorModal, type InwardGeneratorResult } from './InwardBarcodeGeneratorModal'

export interface BatchSelection {
  batchId: string | null
  batchCode: string | null
  barcodes: string[]
}

interface BatchPickerProps {
  productId: string
  qty: number
  value: BatchSelection | null
  onChange: (value: BatchSelection | null) => void
  /** True for Inward (can create new batches), False for Outward (only select existing) */
  allowCreate?: boolean
}

export function BatchPicker({ productId, qty, value, onChange, allowCreate = false }: BatchPickerProps) {
  const { data: batches, isPending, error } = useBatches(productId)
  
  // Track selected existing batch ID
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  
  // Fetch last barcode for auto-generation on existing batch
  const { data: lastBarcode } = useLastBarcode(productId, selectedBatchId || null)
  
  const selectedBatch = useMemo(() => batches?.find(b => b.id === selectedBatchId), [batches, selectedBatchId])
  const { data: batchBarcodes } = useBatchBarcodes(productId, selectedBatch?.code || null)

  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)

  // When an existing batch is selected in allowCreate (Inward) mode, load its pre-generated barcodes from the DB
  useEffect(() => {
    if (selectedBatchId && selectedBatch && allowCreate && batchBarcodes) {
      // Prioritize barcodes waiting in GENERATED state; if none have status yet, take all in the batch
      const generatedOnly = batchBarcodes.filter(b => b.status === 'GENERATED')
      const codesToUse = (generatedOnly.length > 0 ? generatedOnly : batchBarcodes).map(b => b.code)
      
      onChange({
        batchId: selectedBatchId,
        batchCode: selectedBatch.code || null,
        barcodes: codesToUse
      })
    }
  }, [selectedBatchId, selectedBatch, batchBarcodes, allowCreate])

  // Sync selectedBatchId with external value
  useEffect(() => {
    if (!value) {
      setSelectedBatchId('')
    } else if (value.batchId && value.batchId !== selectedBatchId) {
      setSelectedBatchId(value.batchId)
    }
  }, [value, selectedBatchId])

  function handleScan(e: FormEvent) {
    e.preventDefault()
    setScanError(null)
    const code = scanCode.trim()
    if (!code) return

    const existing = batches?.find((b) => b.code === code)
    if (existing) {
      setSelectedBatchId(existing.id)
      if (!allowCreate) {
        onChange({ batchId: existing.id, batchCode: existing.code, barcodes: [] })
      }
      setScanCode('')
    } else if (allowCreate) {
      // If barcode scanned is not a batch, maybe they scanned a product barcode,
      // but here we just show error.
      setScanError('Batch not found.')
    } else {
      setScanError('Batch not found.')
    }
  }

  function handleGeneratorSave(result: InwardGeneratorResult) {
    onChange({
      batchId: null, // It's a new batch, so ID is null, backend will create it
      batchCode: result.batchCode,
      barcodes: result.barcodes
    })
    setIsGeneratorOpen(false)
    setSelectedBatchId('')
  }

  if (error) {
    return <Alert tone="error">Failed to load batches: {toUserMessage(error)}</Alert>
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant/60">
        <Spinner size="sm" />
        <span className="text-body-sm">Loading batches…</span>
      </div>
    )
  }

  const options = (batches || []).map((b, index) => ({
    value: b.id,
    label: index === 0 ? `🟢 ${b.code || 'Unknown'} (Latest)` : (b.code || 'Unknown'),
    description: `Created: ${new Date(b.created_at).toLocaleDateString()}`
  }))
  options.unshift({ value: '', label: 'No batch (generic)', description: '' })

  const isCustomNewBatch = value && value.batchId === null && value.batchCode
  const displayValue = isCustomNewBatch ? 'custom_new' : (selectedBatchId || '')

  if (isCustomNewBatch && !options.find(o => o.value === 'custom_new')) {
    options.push({ value: 'custom_new', label: `New: ${value.batchCode}`, description: `${value.barcodes?.length || 0} barcodes` })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4">
        <div className="flex-1 flex flex-col gap-4">
          <form onSubmit={handleScan}>
            <label className="mb-1.5 ml-1 block text-label-caps uppercase text-on-surface-variant">
              Scan Batch Barcode
            </label>
            <div className="relative">
              <ScanLine
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-outline"
                strokeWidth={1.5}
              />
              <input
                className={cn(
                  'h-14 w-full rounded-xl border-2 bg-surface-container-lowest/50 pl-12 pr-4',
                  'font-mono text-h2 tracking-wide text-on-surface',
                  'transition-all placeholder:font-sans placeholder:text-body-md placeholder:text-outline',
                  'focus:border-primary-container',
                  scanError ? 'border-error/60' : 'border-border'
                )}
                onChange={(event) => setScanCode(event.target.value)}
                placeholder="Scan batch"
                spellCheck={false}
                value={scanCode}
              />
            </div>
            {scanError ? <Alert tone="error" className="mt-2">{scanError}</Alert> : null}
          </form>

          <Select
            label="Or Select Batch (Optional)"
            hint={allowCreate ? "Pick a batch to automatically append sequential barcodes." : "Pick a batch for this movement."}
            value={displayValue}
            onChange={(val) => {
              if (val === 'custom_new') return // Handled by generator
              setSelectedBatchId(val || '')
              if (val) {
                const batch = batches?.find((b) => b.id === val)
                onChange({
                  batchId: val,
                  batchCode: batch?.code || null,
                  barcodes: []
                })
              } else {
                onChange(null)
              }
            }}
            options={options}
          />
        </div>

        {allowCreate && (
          <Button 
            type="button" 
            variant="secondary" 
            onClick={() => setIsGeneratorOpen(true)}
            className="mb-6 h-14 whitespace-nowrap"
          >
            <Plus className="size-5 mr-2 text-primary" />
            Create New Batch & Barcodes
          </Button>
        )}
      </div>

      {allowCreate && value && value.barcodes.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
          <div className="bg-primary text-on-primary rounded-full px-2 py-1 text-xs font-bold font-mono">
            {value.barcodes.length}
          </div>
          <p className="text-body-sm text-on-surface-variant flex-1">
            Barcodes will be generated for <strong className="text-on-surface">{value.batchCode || 'this batch'}</strong> starting from <strong className="font-mono text-primary">{value.barcodes[0]}</strong> to <strong className="font-mono text-primary">{value.barcodes[value.barcodes.length - 1]}</strong>.
          </p>
        </div>
      )}

      {isGeneratorOpen && (
        <InwardBarcodeGeneratorModal
          productId={productId}
          qty={qty}
          onClose={() => setIsGeneratorOpen(false)}
          onSave={handleGeneratorSave}
        />
      )}
    </div>
  )
}
