import { createPortal } from 'react-dom'
import { X, Activity } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { useBatchBarcodes, type BatchBarcodeRow } from '../../hooks/useBatchBarcodes'

interface BatchBarcodesModalProps {
  productId: string
  productName: string
  batchCode: string
  onClose: () => void
}

export function BatchBarcodesModal({ productId, productName, batchCode, onClose }: BatchBarcodesModalProps) {
  const { data: barcodes, isLoading, isError, error } = useBatchBarcodes(productId, batchCode)

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blurred overlay */}
      <div
        className="absolute inset-0 bg-surface/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <Card className="relative z-10 w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface px-6 py-4">
          <div>
            <h2 className="text-h2 text-on-surface">Batch Records</h2>
            <p className="text-body-sm text-on-surface-variant/70 mt-1">
              Tracking details for Batch <span className="font-semibold text-primary">{batchCode}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-0 bg-surface-variant/5 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-on-surface-variant">
              <Activity className="size-6 animate-spin mr-3" />
              <span>Loading tracking records...</span>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-12 text-error flex-col gap-2">
              <p className="font-bold">Error loading records</p>
              <p className="text-sm font-mono">{error?.message || String(error)}</p>
            </div>
          ) : (
            <DataTable<BatchBarcodeRow>
              columns={[
                {
                  header: 'Date Time',
                  cell: (row) => new Date(row.created_at).toLocaleString()
                },
                {
                  header: 'Batch Code',
                  cell: () => batchCode
                },
                {
                  header: 'Product',
                  cell: () => productName
                },
                {
                  header: 'Barcode Number',
                  cell: (row) => row.code
                },
                {
                  header: 'Scan / Symbology',
                  cell: (row) => row.symbology
                },
                {
                  header: 'Performed By',
                  cell: () => 'System' // Placeholder until user profile join is implemented
                }
              ]}
              data={barcodes || []}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/30 bg-surface px-6 py-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  )

  return createPortal(content, document.body)
}
