import { Printer } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { BarcodeLabel } from './BarcodeLabel'
import { usePrintLabels } from '@/hooks/usePrintLabels'
import { DEFAULT_LABEL_SIZE, LABEL_SIZES, MAX_COPIES } from '@/lib/labelDocument'

interface LabelPrintPanelProps {
  code: string
  productName: string
}

/**
 * Label preview and printing (DSK-211, DSK-212, DSK-213, DSK-214).
 *
 * One label or many: SRD §9 asks for both, and the only difference is the copy count, so they
 * are one control rather than two buttons that drift apart.
 */
export function LabelPrintPanel({ code, productName }: LabelPrintPanelProps) {
  const [sizeId, setSizeId] = useState(DEFAULT_LABEL_SIZE.id)
  const [copies, setCopies] = useState('1')
  const { print, isPrinting, error, clearError } = usePrintLabels()

  const size = LABEL_SIZES.find((option) => option.id === sizeId) ?? DEFAULT_LABEL_SIZE
  const copyCount = Number(copies.trim())
  const isCopyCountValid = Number.isInteger(copyCount) && copyCount >= 1 && copyCount <= MAX_COPIES

  function handlePrint() {
    clearError()
    if (!isCopyCountValid) return
    void print({ productName, code, copies: copyCount, size })
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <BarcodeLabel code={code} productName={productName} />

      <Select
        label="Label size"
        onChange={setSizeId}
        options={LABEL_SIZES.map((option) => ({ value: option.id, label: option.label }))}
        value={sizeId}
      />

      <Field
        error={
          copies.trim() !== '' && !isCopyCountValid
            ? `Enter a whole number between 1 and ${MAX_COPIES}.`
            : undefined
        }
        hint="One label per copy."
        inputMode="numeric"
        label="Copies"
        max={MAX_COPIES}
        min={1}
        onChange={(event) => setCopies(event.target.value)}
        type="number"
        value={copies}
      />

      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <Button
        disabled={!isCopyCountValid}
        icon={<Printer aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
        isLoading={isPrinting}
        onClick={handlePrint}
      >
        {copyCount === 1 ? 'Print label' : `Print ${isCopyCountValid ? copyCount : ''} labels`}
      </Button>
    </div>
  )
}
