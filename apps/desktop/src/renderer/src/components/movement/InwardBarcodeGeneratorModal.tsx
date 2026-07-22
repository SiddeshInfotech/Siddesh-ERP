import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { BARCODE_FORMAT_OPTIONS, generateCustomBarcodeSequence, type BarcodeFormatId } from '@/lib/sequence'
import { useProducts } from '@/hooks/useProducts'
import { useLastBarcode } from '@/hooks/useBatches'

export interface InwardGeneratorResult {
  batchCode: string
  barcodes: string[]
}

interface Props {
  productId: string
  qty: number
  onClose: () => void
  onSave: (result: InwardGeneratorResult) => void
}

export function InwardBarcodeGeneratorModal({ productId, qty, onClose, onSave }: Props) {
  const { data: productsData } = useProducts()
  const product = productsData?.items.find(p => p.id === productId)
  
  const { data: lastBarcode } = useLastBarcode(productId, null) // Get very last barcode for this product to find startSeq

  const [batchCode, setBatchCode] = useState<string>('')
  const [selectedFormatId, setSelectedFormatId] = useState<BarcodeFormatId>('SKU_DATE_SEQ')
  const [customPrefix, setCustomPrefix] = useState<string>('SIDD')
  const [startSeq, setStartSeq] = useState<number>(1)

  // Auto-generate batch code on mount
  useEffect(() => {
    const d = new Date()
    const yymmdd = [
      String(d.getFullYear()).slice(2),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('')
    // Ideally we would fetch the next sequence from the server, but for now we suggest this
    // The server will actually override this or create it if we pass it down
    setBatchCode(`BATCH-${yymmdd}-001`)
  }, [])

  // Auto-guess next sequence based on last barcode
  useEffect(() => {
    if (lastBarcode?.code) {
      const match = lastBarcode.code.match(/(\d+)$/)
      if (match) {
        setStartSeq(parseInt(match[1] || '0', 10) + 1)
      }
    }
  }, [lastBarcode])

  const generatedSequence = useMemo(() => {
    return generateCustomBarcodeSequence(selectedFormatId, startSeq, qty, {
      skuCode: product?.name ? product.name.slice(0, 4) : 'PROD',
      categoryName: product?.categoryName || 'GEN',
      customPrefix,
      date: new Date()
    })
  }, [selectedFormatId, startSeq, qty, product, customPrefix])

  const handleSave = () => {
    if (!batchCode.trim()) return
    onSave({
      batchCode: batchCode.trim(),
      barcodes: generatedSequence
    })
  }

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-full">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-h3 font-semibold text-on-surface flex items-center gap-2">
              <ListOrdered className="size-5 text-primary" />
              Create Batch & Barcodes
            </h2>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Generating {qty} sequential barcodes for {product?.name || 'this product'}.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
            <X className="size-5" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Batch Number"
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              required
            />
            <Field
              label="Starting Sequence Number"
              type="number"
              min={1}
              value={startSeq}
              onChange={(e) => setStartSeq(parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-label-caps uppercase text-on-surface-variant font-medium">Barcode Format</h3>
            
            <Select
              label="Sequence Format"
              value={selectedFormatId}
              onChange={(v) => setSelectedFormatId(v as BarcodeFormatId)}
              options={BARCODE_FORMAT_OPTIONS.map((f) => ({
                value: f.id,
                label: f.name,
                description: f.patternDescription
              }))}
            />

            {selectedFormatId === 'CUSTOM_PREFIX' && (
              <Field
                label="Custom Prefix"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                maxLength={6}
              />
            )}
          </div>

          <div className="bg-surface-container-lowest border border-border rounded-xl p-4 mt-2">
            <h3 className="text-label-sm text-on-surface-variant mb-3 flex items-center justify-between">
              <span>Preview (First & Last)</span>
              <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">Qty: {qty}</span>
            </h3>
            <div className="flex flex-col gap-2 font-mono text-body-lg">
              <div className="flex items-center gap-3">
                <span className="text-on-surface-variant text-sm w-12">Start:</span>
                <span className="font-semibold text-on-surface">{generatedSequence[0]}</span>
              </div>
              {qty > 1 && (
                <>
                  <div className="flex flex-col items-start gap-1 text-outline/50 pl-16">
                    <span className="h-1 w-1 rounded-full bg-current" />
                    <span className="h-1 w-1 rounded-full bg-current" />
                    <span className="h-1 w-1 rounded-full bg-current" />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-on-surface-variant text-sm w-12">End:</span>
                    <span className="font-semibold text-on-surface">{generatedSequence[generatedSequence.length - 1]}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border flex items-center justify-end gap-3 bg-surface-container-lowest">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="gap-2">
            <Plus className="size-4" />
            Apply to Inward
          </Button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
