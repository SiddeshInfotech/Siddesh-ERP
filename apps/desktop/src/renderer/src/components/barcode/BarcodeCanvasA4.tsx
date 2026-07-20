import { useState } from 'react'
import { Printer, Download, Grid, ArrowLeft } from 'lucide-react'
import { generateCode128Svg } from '@/lib/code128'

export interface BarcodeLabelData {
  barcode: string
  productName: string
  categoryOrModel?: string
  brand?: string
}

export type PresetKey = 'medium24' | 'micro65' | 'dense40' | 'large14' | 'shipping8'

export interface GridPreset {
  key: PresetKey
  name: string
  labelsPerPage: number
  cols: number
  rows: number
  labelHeightMm: number
  description: string
}

export const GRID_PRESETS: GridPreset[] = [
  {
    key: 'medium24',
    name: 'Standard Medium (24/page)',
    labelsPerPage: 24,
    cols: 3,
    rows: 8,
    labelHeightMm: 36,
    description: '3×8 grid (~70×36mm) - Best for standard product boxes'
  },
  {
    key: 'micro65',
    name: 'Compact / Micro (65/page)',
    labelsPerPage: 65,
    cols: 5,
    rows: 13,
    labelHeightMm: 21,
    description: '5×13 grid (~38×21mm) - Best for small components & ICs'
  },
  {
    key: 'dense40',
    name: 'Dense Small (40/page)',
    labelsPerPage: 40,
    cols: 4,
    rows: 10,
    labelHeightMm: 28,
    description: '4×10 grid (~48×28mm) - Best for cables & accessories'
  },
  {
    key: 'large14',
    name: 'Large Box (14/page)',
    labelsPerPage: 14,
    cols: 2,
    rows: 7,
    labelHeightMm: 38,
    description: '2×7 grid (~99×38mm) - Best for pen drives & AI Lab kits'
  },
  {
    key: 'shipping8',
    name: 'Shipping / Extra Large (8/page)',
    labelsPerPage: 8,
    cols: 2,
    rows: 4,
    labelHeightMm: 70,
    description: '2×4 grid (~99×70mm) - Best for outer shipping cartons'
  }
]

interface BarcodeCanvasA4Props {
  items: BarcodeLabelData[]
  onBack?: () => void
}

export function BarcodeCanvasA4({ items, onBack }: BarcodeCanvasA4Props) {
  const [selectedPresetKey, setSelectedPresetKey] = useState<PresetKey>('medium24')

  const preset = (GRID_PRESETS.find((p) => p.key === selectedPresetKey) || GRID_PRESETS[0])!

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-900 font-sans print:bg-white print:min-h-0">
      {/* Top Toolbar - Hidden during printing */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Grid className="w-5 h-5 text-indigo-600" />
              A4 Barcode Label Printing Canvas
            </h1>
            <p className="text-xs text-slate-500">
              {items.length} label{items.length !== 1 ? 's' : ''} ready to print
            </p>
          </div>
        </div>

        {/* Preset Layout Selector & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <span className="text-xs font-medium text-slate-600 pl-2">Grid Layout:</span>
            <select
              value={selectedPresetKey}
              onChange={(e) => setSelectedPresetKey(e.target.value as PresetKey)}
              className="text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {GRID_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            Direct Print / PDF
          </button>
        </div>
      </header>

      {/* Description Info Banner */}
      <div className="px-6 py-2 bg-indigo-50/70 border-b border-indigo-100 text-xs text-indigo-900 flex items-center justify-between print:hidden">
        <span>💡 {preset.description}</span>
        <span className="font-semibold text-indigo-700">Code 128 High-Density Vector Barcodes</span>
      </div>

      {/* A4 Sheet Container */}
      <main className="flex-1 flex justify-center p-6 print:p-0 print:m-0 overflow-auto">
        <div
          className="bg-white shadow-xl rounded-sm p-[10mm] print:shadow-none print:p-0 print:m-0 print:w-full"
          style={{
            width: '210mm',
            minHeight: '297mm',
            boxSizing: 'border-box'
          }}
        >
          {/* Grid Layout */}
          <div
            className="grid gap-2 print:gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${preset.cols}, minmax(0, 1fr))`
            }}
          >
            {items.map((item, index) => {
              const svgMarkup = generateCode128Svg(item.barcode, {
                height: preset.key === 'micro65' ? 24 : preset.key === 'dense40' ? 32 : 44,
                includeText: true,
                textColor: '#09090b',
                barColor: '#09090b'
              })

              return (
                <div
                  key={`${item.barcode}-${index}`}
                  className="flex flex-col justify-between items-center text-center p-2 border border-slate-300 rounded-md bg-white print:border-slate-400 print:break-inside-avoid"
                  style={{
                    minHeight: `${preset.labelHeightMm}mm`,
                    boxSizing: 'border-box'
                  }}
                >
                  {/* Top Branding & Product Info */}
                  <div className="w-full flex justify-between items-center text-[9px] font-bold text-slate-700 border-b border-slate-100 pb-0.5 mb-1">
                    <span className="truncate max-w-[70%] font-semibold text-slate-800">
                      {item.productName}
                    </span>
                    <span className="text-[8px] text-slate-500 uppercase tracking-wider">
                      {item.brand || item.categoryOrModel || 'SIDDESH'}
                    </span>
                  </div>

                  {/* SVG Barcode Render */}
                  <div
                    className="w-full flex justify-center items-center my-0.5"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Embedded CSS for Print Mode */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header, .print\\:hidden {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  )
}
