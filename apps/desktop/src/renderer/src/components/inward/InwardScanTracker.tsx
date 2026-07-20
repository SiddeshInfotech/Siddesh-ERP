import { useState } from 'react'
import { Scan, CheckCircle2, Clock, CheckCheck, RefreshCw, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export interface InwardUnitItem {
  id: string
  unitBarcode: string
  productName: string
  isScanned: boolean
  scannedAt?: string
}

interface InwardScanTrackerProps {
  productName: string
  totalQuantity: number
  units: InwardUnitItem[]
  onUnitsChange: (updatedUnits: InwardUnitItem[]) => void
}

export function InwardScanTracker({
  productName,
  totalQuantity,
  units,
  onUnitsChange
}: InwardScanTrackerProps) {
  const [scanInput, setScanInput] = useState<string>('')
  const [scanFeedback, setScanFeedback] = useState<{ message: string; isError: boolean } | null>(
    null
  )

  const scannedCount = units.filter((u) => u.isScanned).length
  const unscannedCount = totalQuantity - scannedCount

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const query = scanInput.trim().toLowerCase()
    if (!query) return

    // Find first matching pending unit, or any unit with this barcode
    const targetIdx = units.findIndex(
      (u) => !u.isScanned && (u.unitBarcode.toLowerCase() === query || u.id.toLowerCase() === query)
    )

    if (targetIdx !== -1) {
      const updated = [...units]
      const currentUnit = updated[targetIdx]!
      updated[targetIdx] = {
        ...currentUnit,
        isScanned: true,
        scannedAt: new Date().toLocaleTimeString()
      }
      onUnitsChange(updated)
      setScanFeedback({
        message: `✅ Scanned Unit: ${currentUnit.unitBarcode}`,
        isError: false
      })
      setScanInput('')
    } else {
      const alreadyScanned = units.find(
        (u) => u.isScanned && (u.unitBarcode.toLowerCase() === query || u.id.toLowerCase() === query)
      )
      if (alreadyScanned) {
        setScanFeedback({
          message: `⚠️ Unit ${alreadyScanned.unitBarcode} has already been scanned!`,
          isError: true
        })
      } else {
        setScanFeedback({
          message: `❌ Barcode "${scanInput}" does not match any unit in this receiving batch.`,
          isError: true
        })
      }
    }
  }

  const toggleUnitStatus = (unitId: string) => {
    const updated = units.map((u) => {
      if (u.id === unitId) {
        return {
          ...u,
          isScanned: !u.isScanned,
          scannedAt: !u.isScanned ? new Date().toLocaleTimeString() : undefined
        }
      }
      return u
    })
    onUnitsChange(updated)
  }

  const markAllScanned = () => {
    const time = new Date().toLocaleTimeString()
    const updated = units.map((u) => ({
      ...u,
      isScanned: true,
      scannedAt: u.scannedAt || time
    }))
    onUnitsChange(updated)
    setScanFeedback({ message: 'All products marked as scanned.', isError: false })
  }

  const resetAllScanned = () => {
    const updated = units.map((u) => ({
      ...u,
      isScanned: false,
      scannedAt: undefined
    }))
    onUnitsChange(updated)
    setScanFeedback(null)
  }

  return (
    <Card className="p-5 bg-white border border-slate-200 shadow-sm rounded-xl space-y-5 font-sans">
      {/* Header & Status Summary Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Scan className="w-4.5 h-4.5 text-indigo-600" />
            Live Inward Scanning Verification
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{productName}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllScanned}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Scanned
          </button>
          <button
            type="button"
            onClick={resetAllScanned}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Quantity</span>
          <div className="text-lg font-bold font-mono text-slate-900">{totalQuantity}</div>
        </div>

        <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-center">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Scanned Products
          </span>
          <div className="text-lg font-bold font-mono text-emerald-700">{scannedCount}</div>
        </div>

        <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-center">
          <span className="text-[11px] font-semibold text-amber-700 uppercase flex items-center justify-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Unscanned Remaining
          </span>
          <div className="text-lg font-bold font-mono text-amber-700">{unscannedCount}</div>
        </div>
      </div>

      {/* Barcode Scanner Input Form */}
      <form onSubmit={handleScanSubmit} className="space-y-2">
        <label className="block text-xs font-semibold text-slate-700">
          Scan Item Barcode to Verify
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Scan barcode string (e.g. ST00000001)..."
            className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2">
            Verify Scan
          </Button>
        </div>

        {scanFeedback && (
          <p
            className={`text-xs font-semibold mt-1 flex items-center gap-1.5 ${
              scanFeedback.isError ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {scanFeedback.isError && <AlertCircle className="w-3.5 h-3.5" />}
            {scanFeedback.message}
          </p>
        )}
      </form>

      {/* Structured Units Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <th className="py-2.5 px-3 w-12 text-center">#</th>
              <th className="py-2.5 px-3">Unit Barcode</th>
              <th className="py-2.5 px-3">Product Name</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3">Time Scanned</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {units.map((unit, idx) => (
              <tr
                key={unit.id}
                className={`transition-colors ${
                  unit.isScanned ? 'bg-emerald-50/40 hover:bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-500">
                  {idx + 1}
                </td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                  {unit.unitBarcode}
                </td>
                <td className="py-2.5 px-3 text-slate-700 font-medium">{productName}</td>
                <td className="py-2.5 px-3 text-center">
                  {unit.isScanned ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      SCANNED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <Clock className="w-3 h-3 text-amber-600" />
                      UNSCANNED
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-slate-500 font-mono">
                  {unit.scannedAt || '—'}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleUnitStatus(unit.id)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                  >
                    {unit.isScanned ? 'Mark Unscanned' : 'Mark Scanned'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
