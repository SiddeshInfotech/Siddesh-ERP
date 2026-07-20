import { useState, useRef, useMemo } from 'react'
import { Printer, Download, Grid, ArrowLeft, Sparkles, FileText, Layers } from 'lucide-react'
import { generateCode128Svg } from '@/lib/code128'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select, type SelectOption } from '@/components/ui/Select'

export interface BarcodeLabelData {
  barcode: string
  productName: string
  categoryOrModel?: string
  brand?: string
}

export type PresetKey = 'very_small' | 'small' | 'medium' | 'large'

export interface GridPreset {
  key: PresetKey
  name: string
  labelsPerPage: number
  cols: number
  rows: number
  svgHeight: number
  description: string
}

export const GRID_PRESETS: GridPreset[] = [
  {
    key: 'very_small',
    name: 'Very Small (48 / page)',
    labelsPerPage: 48,
    cols: 4,
    rows: 12,
    svgHeight: 22,
    description: '4×12 grid (~45×22mm) — Very compact mini labels'
  },
  {
    key: 'small',
    name: 'Small (30 / page)',
    labelsPerPage: 30,
    cols: 3,
    rows: 10,
    svgHeight: 28,
    description: '3×10 grid (~65×26mm) — Compact package labels'
  },
  {
    key: 'medium',
    name: 'Medium (24 / page)',
    labelsPerPage: 24,
    cols: 3,
    rows: 8,
    svgHeight: 34,
    description: '3×8 grid (~70×32mm) — Standard product box labels'
  },
  {
    key: 'large',
    name: 'Large (12 / page)',
    labelsPerPage: 12,
    cols: 2,
    rows: 6,
    svgHeight: 44,
    description: '2×6 grid (~95×42mm) — Large shipping box labels'
  }
]

const PRESET_SELECT_OPTIONS: SelectOption[] = GRID_PRESETS.map((p) => ({
  value: p.key,
  label: p.name,
  description: p.description
}))

interface BarcodeCanvasA4Props {
  items: BarcodeLabelData[]
  onBack?: () => void
}

export function BarcodeCanvasA4({ items, onBack }: BarcodeCanvasA4Props) {
  const [selectedPresetKey, setSelectedPresetKey] = useState<PresetKey>('medium')
  const sheetRef = useRef<HTMLDivElement>(null)

  const preset = (GRID_PRESETS.find((p) => p.key === selectedPresetKey) || GRID_PRESETS[2])!

  // Chunk items into exact physical A4 paper pages based on labelsPerPage
  const pageChunks = useMemo(() => {
    const size = preset.labelsPerPage
    const chunks: BarcodeLabelData[][] = []
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size))
    }
    return chunks.length > 0 ? chunks : [[]]
  }, [items, preset.labelsPerPage])

  // Direct PDF Download / Print
  const handleDownloadPDF = () => {
    window.print()
  }

  return (
    <div className="flex flex-col gap-gutter print:bg-white print:text-black">
      {/* FIXED PAGE HEADER */}
      <div className="flex items-center justify-between gap-4 print:hidden shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="secondary" size="sm" onClick={onBack}>
              <ArrowLeft className="size-4 mr-1.5" />
              Back
            </Button>
          )}
          <div>
            <h1 className="text-h1 text-on-surface flex items-center gap-2">
              <Grid className="size-5 text-primary" />
              A4 Barcode Label Canvas
            </h1>
            <p className="text-body-sm text-on-surface-variant/70">
              {items.length} label{items.length !== 1 ? 's' : ''} across {pageChunks.length} A4 {pageChunks.length === 1 ? 'page' : 'pages'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleDownloadPDF}>
            <Download className="size-4 mr-1.5" />
            Download PDF
          </Button>

          <Button variant="secondary" onClick={handleDownloadPDF}>
            <Printer className="size-4 mr-1.5" />
            Direct Print
          </Button>
        </div>
      </div>

      {/* FLOATING CARD CONTAINER */}
      <Card>
        {/* Fixed Control & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 hairline-b print:hidden shrink-0">
          <div className="w-72">
            <Select
              label="Grid Layout"
              options={PRESET_SELECT_OPTIONS}
              value={selectedPresetKey}
              onChange={(val) => setSelectedPresetKey(val as PresetKey)}
            />
          </div>

          <div className="flex items-center gap-4 text-body-sm text-on-surface-variant font-medium">
            <span className="flex items-center gap-1.5 text-primary">
              <Sparkles className="size-4 shrink-0" />
              {preset.description}
            </span>
            <span className="flex items-center gap-1 text-on-surface-variant/60 font-mono text-xs">
              <Layers className="size-3.5" /> {pageChunks.length} A4 Page{pageChunks.length !== 1 ? 's' : ''} Total
            </span>
          </div>
        </div>

        {/* REAL PDF A4 PAGES VIEWPORT - CLEAN STACKED A4 SHEETS */}
        <div className="p-8 bg-surface-container-lowest/60 rounded-b-2xl max-h-[calc(100vh-260px)] overflow-y-auto print:max-h-none print:p-0 print:overflow-visible scrollbar-thin">
          <div className="space-y-8">
            {pageChunks.map((pageItems, pageIdx) => (
              <div key={pageIdx}>
                {/* REAL PHYSICAL A4 PAPER SHEET (210mm x 297mm) */}
                <div
                  ref={pageIdx === 0 ? sheetRef : undefined}
                  className="bg-white text-slate-950 shadow-2xl rounded-sm p-[8mm] mx-auto print:shadow-none print:p-0 print:m-0 w-full max-w-[210mm] print:break-after-page transition-all duration-150"
                  style={{
                    minHeight: '297mm',
                    boxSizing: 'border-box'
                  }}
                >
                  <div
                    className="grid gap-2 print:gap-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${preset.cols}, minmax(0, 1fr))`
                    }}
                  >
                    {pageItems.map((item, index) => {
                      const svgMarkup = generateCode128Svg(item.barcode, {
                        height: preset.svgHeight,
                        includeText: true,
                        textColor: '#09090b',
                        barColor: '#09090b'
                      })

                      return (
                        <div
                          key={`${item.barcode}-${index}`}
                          className="flex flex-col items-center text-center p-2 border border-slate-300 rounded bg-white print:border-slate-400 print:break-inside-avoid hover:border-slate-400 transition-colors"
                          style={{
                            boxSizing: 'border-box'
                          }}
                        >
                          {/* Compact Header: Product Name & Brand */}
                          <div className="w-full flex items-center justify-between text-[10px] font-bold text-slate-800 border-b border-slate-200 pb-1 mb-1.5 leading-tight">
                            <span className="truncate max-w-[75%] font-bold text-slate-900">
                              {item.productName}
                            </span>
                            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-tight">
                              {item.brand || item.categoryOrModel || 'SIDDESH'}
                            </span>
                          </div>

                          {/* SVG Barcode Render */}
                          <div
                            className="w-full flex justify-center items-center py-0.5"
                            dangerouslySetInnerHTML={{ __html: svgMarkup }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

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
          .print\\:break-after-page {
            page-break-after: always !important;
            break-after: page !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
        }
      `}</style>
    </div>
  )
}
