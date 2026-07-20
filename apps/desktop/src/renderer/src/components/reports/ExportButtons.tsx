import { FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ReportColumn, ReportMeta } from '@/lib/reportDocument'

interface ExportButtonsProps<Row> {
  rows: Row[]
  columns: ReportColumn<Row>[]
  meta: ReportMeta
  isExporting: boolean
  onExcel: (rows: Row[], columns: ReportColumn<Row>[], meta: ReportMeta) => void
  onPdf: (rows: Row[], columns: ReportColumn<Row>[], meta: ReportMeta) => void
}

/**
 * Excel and PDF export for any report (DSK-413, DSK-414).
 *
 * One component for every report, taking the same column definition the table renders from —
 * so an exported file can never disagree with what is on screen.
 */
export function ExportButtons<Row>({
  rows,
  columns,
  meta,
  isExporting,
  onExcel,
  onPdf
}: ExportButtonsProps<Row>) {
  // Exporting nothing produces an empty file that looks like a failure. Disabling says why.
  const isEmpty = rows.length === 0

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={isEmpty}
        icon={<FileSpreadsheet aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        isLoading={isExporting}
        onClick={() => onExcel(rows, columns, meta)}
        size="sm"
        variant="secondary"
      >
        Excel
      </Button>

      <Button
        disabled={isEmpty}
        icon={<Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        onClick={() => onPdf(rows, columns, meta)}
        size="sm"
        variant="secondary"
      >
        PDF / Print
      </Button>
    </div>
  )
}
