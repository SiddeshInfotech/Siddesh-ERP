import { useState } from 'react'
import { Barcode, X, Layers, Printer, Sparkles } from 'lucide-react'
import { generateBarcodeRange } from '@/lib/sequence'
import { BarcodeCanvasA4, BarcodeLabelData } from './BarcodeCanvasA4'

export interface ProductOption {
  id: string
  name: string
  sku_barcode: string
  category?: string
  brand?: string
}

interface BarcodeGeneratorModalProps {
  product: ProductOption
  onClose: () => void
}

export function BarcodeGeneratorModal({ product, onClose }: BarcodeGeneratorModalProps) {
  const [optionMode, setOptionMode] = useState<'A' | 'B'>('A')
  const [startSeq, setStartSeq] = useState<number>(1)
  const [manufacturerBarcode, setManufacturerBarcode] = useState<string>(product.sku_barcode || '')
  const [quantity, setQuantity] = useState<number>(24)
  const [showCanvas, setShowCanvas] = useState<boolean>(false)

  // Generate sequence labels for Option A, or repeated manufacturer barcodes for Option B
  const generatedBarcodes: string[] =
    optionMode === 'A'
      ? generateBarcodeRange(startSeq, quantity)
      : Array(Math.max(1, quantity)).fill(manufacturerBarcode || product.sku_barcode || 'ST00000001')

  const labelItems: BarcodeLabelData[] = generatedBarcodes.map((code) => ({
    barcode: code,
    productName: product.name,
    categoryOrModel: product.category,
    brand: product.brand
  }))

  if (showCanvas) {
    return <BarcodeCanvasA4 items={labelItems} onBack={() => setShowCanvas(false)} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Generate Barcode Labels</h2>
              <p className="text-xs text-slate-500 font-medium">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6">
          {/* Mode Selection Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Barcode Mode
            </label>
            <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setOptionMode('A')}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-lg transition-all ${
                  optionMode === 'A'
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Option A: Software Auto-Generated
              </button>
              <button
                type="button"
                onClick={() => setOptionMode('B')}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-lg transition-all ${
                  optionMode === 'B'
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-500" />
                Option B: Manufacturer Barcode
              </button>
            </div>
          </div>

          {/* Mode Specific Inputs */}
          {optionMode === 'A' ? (
            <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-indigo-900">Sequence Generator</span>
                <span className="text-indigo-600 font-mono font-bold">
                  Prefix: ST (e.g. ST00000001)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Start Sequence Index
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={startSeq}
                    onChange={(e) => setStartSeq(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity to Print
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-indigo-700 font-medium">
                Generating sequence range: <code className="font-bold">{generatedBarcodes[0]}</code> to{' '}
                <code className="font-bold">{generatedBarcodes[generatedBarcodes.length - 1]}</code>
              </p>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-emerald-900">External Manufacturer Barcode</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Manufacturer Barcode String
                  </label>
                  <input
                    type="text"
                    value={manufacturerBarcode}
                    onChange={(e) => setManufacturerBarcode(e.target.value)}
                    placeholder="e.g. 8901234567890"
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity of Copies
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-200/60 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => setShowCanvas(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all"
          >
            <Printer className="w-4 h-4" />
            Open A4 Printable Sheet
          </button>
        </div>
      </div>
    </div>
  )
}
