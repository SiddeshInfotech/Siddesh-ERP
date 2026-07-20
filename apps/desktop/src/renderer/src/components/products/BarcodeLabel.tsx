import { useEffect, useRef, useState } from 'react'
import { renderInto } from '@/lib/barcode'
import { cn } from '@/lib/cn'

interface BarcodeLabelProps {
  code: string
  productName: string
  className?: string
}

/**
 * On-screen preview of the printed label (DSK-211, DSK-212).
 *
 * Shows what actually comes out of the printer: product name, scannable Code 128 bars, and
 * the digits underneath (SRD §9). The white card is not decoration — the label stock is white
 * and a scanner needs the contrast, so previewing it on our dark surface would be a lie about
 * what gets stuck on the box.
 */
export function BarcodeLabel({ code, productName, className }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (svg === null) return

    try {
      renderInto(svg, code, { showText: true, barWidth: 2, height: 56 })
      setRenderError(null)
    } catch {
      // jsbarcode throws InvalidInputException for anything Code 128 cannot represent. Showing
      // a broken preview would imply the label is fine, so say so instead.
      setRenderError('This code cannot be printed as a barcode.')
    }
  }, [code])

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md bg-white p-4',
        className
      )}
    >
      {renderError === null ? (
        <>
          <p className="max-w-full truncate text-center text-[11px] font-bold text-black">
            {productName}
          </p>
          {/* aria-hidden: the bars are a picture of the code, and the code is already text
              below. A screen reader announcing both would just repeat itself. */}
          <svg aria-hidden="true" ref={svgRef} />
        </>
      ) : (
        <p className="py-4 text-center text-body-sm font-semibold text-[#ba1a1a]">{renderError}</p>
      )}
    </div>
  )
}
