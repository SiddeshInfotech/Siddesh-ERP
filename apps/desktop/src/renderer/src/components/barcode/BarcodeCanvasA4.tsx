// 2. External packages
import { useMemo, useState } from 'react'
import { ArrowLeft, Download, Grid, Layers, Printer, Sparkles } from 'lucide-react'

// 4. Local — absolute alias before relative
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select, type SelectOption } from '@/components/ui/Select'
import { buildBarcodeLabelsPdf, type LabelData } from '@/lib/barcodePdf'
import { generateCode128Svg } from '@/lib/code128'

/** Re-exported under the historical name so existing callers keep compiling. */
export type BarcodeLabelData = LabelData

export type PresetKey = 'very_small' | 'small' | 'medium' | 'large'

export interface GridPreset {
  key: PresetKey
  name: string
  cols: number
  rows: number
  description: string
}

/** Each preset tiles the whole A4 sheet; `cols * rows` is the labels-per-page count. */
export const GRID_PRESETS: GridPreset[] = [
  {
    key: 'very_small',
    name: 'Very Small (48 / page)',
    cols: 4,
    rows: 12,
    description: '4×12 grid — very compact mini labels'
  },
  {
    key: 'small',
    name: 'Small (30 / page)',
    cols: 3,
    rows: 10,
    description: '3×10 grid — compact package labels'
  },
  {
    key: 'medium',
    name: 'Medium (24 / page)',
    cols: 3,
    rows: 8,
    description: '3×8 grid — standard product box labels'
  },
  {
    key: 'large',
    name: 'Large (12 / page)',
    cols: 2,
    rows: 6,
    description: '2×6 grid — large shipping box labels'
  }
]

const PRESET_SELECT_OPTIONS: SelectOption[] = GRID_PRESETS.map((p) => ({
  value: p.key,
  label: p.name,
  description: p.description
}))

// A4 printable geometry, mirrored from lib/barcodePdf so the on-screen sheet
// matches the generated PDF (6mm margin, 2mm gutter on a 210mm-wide page).
const PAGE_PADDING_PCT = `${(6 / 210) * 100}%`
const CELL_GAP_PCT = `${(2 / 210) * 100}%`

interface BarcodeCanvasA4Props {
  items: BarcodeLabelData[]
  onBack?: () => void
}

export function BarcodeCanvasA4({ items, onBack }: BarcodeCanvasA4Props) {
  const [selectedPresetKey, setSelectedPresetKey] = useState<PresetKey>('medium')
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

  const preset = GRID_PRESETS.find((p) => p.key === selectedPresetKey) ?? GRID_PRESETS[2]!
  const perPage = preset.cols * preset.rows
  const hasItems = items.length > 0

  // Slice items into physical A4 pages of exactly `perPage` labels each.
  const pageChunks = useMemo(() => {
    const chunks: BarcodeLabelData[][] = []
    for (let i = 0; i < items.length; i += perPage) {
      chunks.push(items.slice(i, i + perPage))
    }
    return chunks.length > 0 ? chunks : [[]]
  }, [items, perPage])

  // Cache one SVG per distinct barcode — Option B repeats the same code many times.
  const svgByBarcode = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      if (!map.has(item.barcode)) {
        map.set(
          item.barcode,
          generateCode128Svg(item.barcode, {
            height: 46,
            includeText: true,
            textColor: '#09090b',
            barColor: '#09090b'
          })
        )
      }
    }
    return map
  }, [items])

  // Vector PDF — barcodes are drawn as real rectangles, so the file is crisp at
  // any zoom, tiny, and every `perPage` labels start a new physical page.
  const handleDownloadPDF = () => {
    if (!hasItems) return
    setIsGeneratingPDF(true)
    try {
      const pdf = buildBarcodeLabelsPdf(items, { cols: preset.cols, rows: preset.rows })
      
      const productName = items[0]?.productName 
        ? items[0].productName.replace(/[^a-z0-9]/gi, '_') 
        : 'Product'
      const quantity = items.length
      const d = new Date()
      const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
      
      pdf.save(`${productName}_${quantity}_${dateStr}.pdf`)
    } catch (err) {
      console.error('Barcode PDF generation failed', err)
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  const handlePrint = () => {
    if (hasItems) window.print()
  }

  return (
    <div className="flex flex-col gap-gutter print:bg-white print:text-black">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4 print:hidden">
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
              {items.length} label{items.length !== 1 ? 's' : ''} across {pageChunks.length} A4{' '}
              {pageChunks.length === 1 ? 'page' : 'pages'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleDownloadPDF} isLoading={isGeneratingPDF} disabled={!hasItems}>
            <Download className="size-4 mr-1.5" />
            Download PDF
          </Button>
          <Button variant="secondary" onClick={handlePrint} disabled={!hasItems}>
            <Printer className="size-4 mr-1.5" />
            Direct Print
          </Button>
        </div>
      </div>

      {/* TWO-PANE: controls (left) + all-pages preview (right) */}
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-[300px_minmax(0,1fr)] print:block">
        {/* LEFT — CONTROLS */}
        <Card className="h-fit print:hidden">
          <div className="flex flex-col gap-5 p-5">
            <Select
              label="Grid Layout"
              options={PRESET_SELECT_OPTIONS}
              value={selectedPresetKey}
              onChange={(val) => setSelectedPresetKey(val as PresetKey)}
            />

            <div className="flex items-start gap-2 text-body-sm text-primary">
              <Sparkles className="size-4 shrink-0 mt-0.5" />
              <span>{preset.description}</span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-surface-variant/30 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-on-surface-variant/60">
                  Per page
                </dt>
                <dd className="text-h2 text-on-surface">{perPage}</dd>
              </div>
              <div className="rounded-xl bg-surface-variant/30 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-on-surface-variant/60">
                  A4 pages
                </dt>
                <dd className="text-h2 text-on-surface">{pageChunks.length}</dd>
              </div>
            </dl>

            <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant/70">
              <Layers className="size-3.5" />
              Labels fill the whole sheet at the selected grid.
            </p>
          </div>
        </Card>

        {/* RIGHT — PREVIEW BOX (all pages) */}
        <Card className="barcode-preview-card overflow-hidden print:rounded-none print:border-0 print:bg-white">
          <div className="flex items-center justify-between gap-2 px-5 py-3 hairline-b print:hidden">
            <h2 className="text-body-md font-semibold text-on-surface">Preview</h2>
            <span className="font-mono text-xs text-on-surface-variant/60">
              {pageChunks.length} page{pageChunks.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="max-h-[calc(100vh-240px)] space-y-8 overflow-y-auto bg-surface-container-lowest/40 p-6 scrollbar-thin print:max-h-none print:space-y-0 print:overflow-visible print:bg-white print:p-0">
            {pageChunks.map((pageItems, pageIdx) => (
              <div key={pageIdx} className="mx-auto w-full max-w-[720px] print:max-w-none">
                <div className="mb-2 text-center text-xs font-medium text-on-surface-variant/50 print:hidden">
                  Page {pageIdx + 1} / {pageChunks.length}
                </div>

                {/* PHYSICAL A4 SHEET — aspect-locked, container-query sized */}
                <div
                  className="a4-paper-sheet mx-auto w-full rounded-sm bg-white text-slate-950 shadow-2xl print:rounded-none print:shadow-none"
                  style={{
                    aspectRatio: '210 / 297',
                    containerType: 'inline-size',
                    padding: PAGE_PADDING_PCT
                  }}
                >
                  <div
                    className="grid h-full w-full"
                    style={{
                      gridTemplateColumns: `repeat(${preset.cols}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${preset.rows}, minmax(0, 1fr))`,
                      gap: CELL_GAP_PCT
                    }}
                  >
                    {pageItems.map((item, index) => (
                      <div
                        key={`${item.barcode}-${index}`}
                        className="flex min-h-0 flex-col overflow-hidden border border-slate-300 bg-white"
                        style={{ padding: '3%', borderRadius: '0.6cqw' }}
                      >
                        {/* Header: product name + brand */}
                        <div
                          className="flex shrink-0 items-center justify-between gap-[3%] border-b border-slate-200 leading-none"
                          style={{ paddingBottom: '0.5cqw', marginBottom: '0.5cqw' }}
                        >
                          <span
                            className="truncate font-bold text-slate-900"
                            style={{ fontSize: 'clamp(5px, 1.15cqw, 12px)' }}
                          >
                            {item.productName}
                          </span>
                          <span
                            className="shrink-0 font-semibold uppercase tracking-tight text-slate-500"
                            style={{ fontSize: 'clamp(4px, 0.95cqw, 10px)' }}
                          >
                            {item.brand || item.categoryOrModel || 'SIDDESH'}
                          </span>
                        </div>

                        {/* Barcode — SVG scales to fill the remaining cell space */}
                        <div
                          className="flex min-h-0 flex-1 items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: svgByBarcode.get(item.barcode) ?? '' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Print: full-size A4 sheets, one per page, app chrome hidden */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          nav, aside, header, footer, .print\\:hidden { display: none !important; }
          .barcode-preview-card { box-shadow: none !important; }
          .a4-paper-sheet {
            width: 210mm !important;
            height: 297mm !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            padding: 6mm !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
            break-after: page;
          }
          .a4-paper-sheet:last-child { page-break-after: auto; break-after: auto; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  )
}
