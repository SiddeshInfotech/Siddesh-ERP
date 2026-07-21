import { useCallback, useMemo, useState } from 'react'
import { useProducts } from '@/hooks/useProducts'
import { useScanLookup } from '@/hooks/useScanLookup'

/**
 * State for "which product is being moved" (DSK-302, DSK-303, DSK-311, DSK-312).
 *
 * The selected product is DERIVED from the scan result or the chosen id — it is never copied
 * into its own state. That matters for more than tidiness: the picked product carries a stock
 * figure, and a mirrored copy would keep showing the old number after an inward invalidates
 * the cache. Derived, it re-reads for free. Copying server state into local state is how a
 * storekeeper ends up looking at a confidently wrong quantity.
 */

export interface PickedProduct {
  id: string
  name: string
  skuBarcode: string
  uom: string | null
  qtyOnHand: number
  qtyAvailable: number
  batchCode?: string | null
}

export function useProductPicker() {
  const [typedCode, setTypedCode] = useState('')
  /** Committed barcode. Set on Enter only — one scan, one lookup. */
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  /** Set when the product was chosen by name instead of scanned. */
  const [chosenId, setChosenId] = useState<string | null>(null)

  const lookup = useScanLookup(scannedCode)
  const products = useProducts()

  const picked = useMemo<PickedProduct | null>(() => {
    if (lookup.data?.found === true) {
      const { product, stock } = lookup.data
      return {
        id: product.id,
        name: product.name,
        skuBarcode: product.sku_barcode,
        uom: product.unit,
        qtyOnHand: stock.qty_on_hand,
        qtyAvailable: stock.qty_available,
        batchCode: lookup.data.batch?.code
      }
    }

    if (chosenId === null) return null

    const match = products.data?.items.find((item) => item.id === chosenId)
    if (match === undefined) return null

    return {
      id: match.id,
      name: match.name,
      skuBarcode: match.skuBarcode,
      uom: match.uomCode,
      qtyOnHand: match.qtyOnHand,
      qtyAvailable: match.qtyAvailable,
      batchNo: null // Choosing by name does not imply a batch
    }
  }, [lookup.data, chosenId, products.data])

  /** Commits a scanned or typed barcode. The two selection modes are mutually exclusive. */
  const scan = useCallback((code: string) => {
    const trimmed = code.trim()
    if (trimmed.length === 0) return
    setChosenId(null)
    setScannedCode(trimmed)
  }, [])

  const choose = useCallback((productId: string) => {
    setScannedCode(null)
    setTypedCode('')
    setChosenId(productId === '' ? null : productId)
  }, [])

  const reset = useCallback(() => {
    setTypedCode('')
    setScannedCode(null)
    setChosenId(null)
  }, [])

  return {
    picked,
    typedCode,
    setTypedCode,
    scan,
    choose,
    reset,
    /** True when the scanned code matched nothing — an offer to create, not an error (SRD §13). */
    isNotFound: lookup.data?.found === false,
    isLooking: lookup.isFetching,
    lookupError: lookup.error,
    products
  }
}

export type ProductPickerState = ReturnType<typeof useProductPicker>
