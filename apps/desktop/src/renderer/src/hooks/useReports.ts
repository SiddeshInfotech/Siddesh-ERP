import { useQuery } from '@tanstack/react-query'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Report queries (SRD §7, §11, §12; DSK-401 → DSK-412).
 *
 * Everything here reads a view or a document table — never a raw ledger aggregate computed in
 * the client. Stock is derived from the ledger by `v_current_stock` (rule 0.7), so the reports
 * and the Products list cannot disagree about a number.
 *
 * All views are `security_invoker`, so an office only ever sees its own rows; an ADMIN sees
 * all three and figures are summed.
 */

/** Reports are read at a point in time and printed; they do not need to be live. */
const REPORT_STALE_TIME = 30_000

/** A report can grow forever (the ledger especially), so every query is capped. §3. */
export const REPORT_LIMIT = 5000

export interface DateRange {
  /** ISO date, inclusive. Empty means "no lower bound". */
  from: string
  /** ISO date, inclusive. Empty means "no upper bound". */
  to: string
}

/**
 * `to` is an inclusive DATE but the column is a timestamptz, so a plain `lte` would drop
 * everything that happened after midnight on the last day — i.e. almost the whole day the
 * user asked for. Comparing against the start of the NEXT day fixes that.
 */
function endExclusive(to: string): string {
  const next = new Date(`${to}T00:00:00`)
  next.setDate(next.getDate() + 1)
  return next.toISOString()
}

export interface StockRow {
  productId: string
  productCode: string
  productName: string
  skuBarcode: string
  categoryName: string | null
  brandName: string | null
  uomCode: string | null
  officeName: string | null
  openingQty: number
  inwardQty: number
  outwardQty: number
  qtyOnHand: number
  qtyReserved: number
  qtyAvailable: number
  minStock: number
  isLowStock: boolean
}

/**
 * Current stock, one row per product per office (SRD §7; DSK-406, DSK-407, DSK-408).
 *
 * Only products that have ever had a balance appear — `v_current_stock` inner-joins
 * stock_balances. A product created but never received has no row here, which is correct for
 * a stock report: it has no stock to report.
 */
export function useCurrentStock() {
  return useQuery({
    queryKey: ['report', 'current-stock'],
    staleTime: REPORT_STALE_TIME,
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase
        .from('v_stock_dashboard')
        .select(
          'product_id, product_code, product_name, sku_barcode, category_name, brand_name, uom_code, office_name, opening_qty, inward_qty, outward_qty, qty_on_hand, qty_reserved, qty_available, min_stock, is_low_stock'
        )
        .order('product_name')
        .limit(REPORT_LIMIT)

      if (error) {
        logger.error('Current stock report failed', toLogContext(error))
        throw error
      }

      return data
        .filter((row) => row.product_id !== null)
        .map((row) => ({
          productId: row.product_id ?? '',
          productCode: row.product_code ?? '',
          productName: row.product_name ?? '',
          skuBarcode: row.sku_barcode ?? '',
          categoryName: row.category_name,
          brandName: row.brand_name,
          uomCode: row.uom_code,
          officeName: row.office_name,
          openingQty: row.opening_qty ?? 0,
          inwardQty: row.inward_qty ?? 0,
          outwardQty: row.outward_qty ?? 0,
          qtyOnHand: row.qty_on_hand ?? 0,
          qtyReserved: row.qty_reserved ?? 0,
          qtyAvailable: row.qty_available ?? 0,
          minStock: row.min_stock ?? 0,
          isLowStock: row.is_low_stock ?? false
        }))
    }
  })
}

export interface LedgerRow {
  id: string
  occurredAt: string
  productName: string
  skuBarcode: string
  txnType: string
  qtyDelta: number
  balanceAfter: number
  partyName: string | null
  createdByName: string | null
  notes: string | null
}

/**
 * One product's full history (SRD §11; DSK-411).
 *
 * "01 Jan | Inward | +20 | Supplier ABC" — exactly the SRD's example, and the reason the
 * ledger is append-only: this table IS the audit trail.
 */
export function useProductLedger(productId: string | null, range: DateRange) {
  return useQuery({
    queryKey: ['report', 'ledger', productId, range.from, range.to],
    enabled: productId !== null && productId !== '',
    staleTime: REPORT_STALE_TIME,
    queryFn: async (): Promise<LedgerRow[]> => {
      let query = supabase
        .from('v_product_ledger')
        .select(
          'id, occurred_at, product_name, sku_barcode, txn_type, qty_delta, balance_after, party_name, created_by_name, notes'
        )
        .eq('product_id', productId ?? '')
        .order('occurred_at', { ascending: false })
        .limit(REPORT_LIMIT)

      if (range.from !== '') query = query.gte('occurred_at', `${range.from}T00:00:00`)
      if (range.to !== '') query = query.lt('occurred_at', endExclusive(range.to))

      const { data, error } = await query
      if (error) {
        logger.error('Product ledger failed', { productId, ...toLogContext(error) })
        throw error
      }

      return data.map((row) => ({
        id: row.id ?? '',
        occurredAt: row.occurred_at ?? '',
        productName: row.product_name ?? '',
        skuBarcode: row.sku_barcode ?? '',
        txnType: row.txn_type ?? '',
        qtyDelta: row.qty_delta ?? 0,
        balanceAfter: row.balance_after ?? 0,
        partyName: row.party_name,
        createdByName: row.created_by_name,
        notes: row.notes
      }))
    }
  })
}

/**
 * Recent transactions across all products for the Dashboard (SRD §12).
 */
export function useRecentTransactions(limit = 10) {
  return useQuery({
    queryKey: ['report', 'recent-transactions', limit],
    staleTime: REPORT_STALE_TIME,
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase
        .from('v_product_ledger')
        .select(
          'id, occurred_at, product_name, sku_barcode, txn_type, qty_delta, balance_after, party_name, created_by_name, notes'
        )
        .order('occurred_at', { ascending: false })
        .limit(limit)

      if (error) {
        logger.error('Recent transactions failed', toLogContext(error))
        throw error
      }

      return data.map((row) => ({
        id: row.id ?? '',
        occurredAt: row.occurred_at ?? '',
        productName: row.product_name ?? '',
        skuBarcode: row.sku_barcode ?? '',
        txnType: row.txn_type ?? '',
        qtyDelta: row.qty_delta ?? 0,
        balanceAfter: row.balance_after ?? 0,
        partyName: row.party_name,
        createdByName: row.created_by_name,
        notes: row.notes
      }))
    }
  })
}

export interface InwardRow {
  id: string
  inwardNo: string
  receivedAt: string
  supplierName: string | null
  productName: string
  skuBarcode: string
  quantity: number
  invoiceNo: string | null
  invoiceDate: string | null
  purchaseOrderNo: string | null
  broughtBy: string | null
}

/** Receipts, date/supplier/product-wise (SRD §11; DSK-409). */
export function useInwardReport(range: DateRange, supplierName?: string, productId?: string) {
  return useQuery({
    queryKey: ['report', 'inward', range.from, range.to, supplierName, productId],
    staleTime: REPORT_STALE_TIME,
    queryFn: async (): Promise<InwardRow[]> => {
      // !inner so a filter on the parent actually restricts the rows rather than nulling the
      // embed. One query with joins, never a fetch per row (§3).
      let query = supabase
        .from('inward_items')
        .select(
          'id, quantity, products!inner(name, product_code, product_barcodes(code, is_primary)), inwards!inner(inward_no, received_at, invoice_no, invoice_date, purchase_order_no, brought_by, suppliers(name))'
        )
        .order('received_at', { ascending: false, referencedTable: 'inwards' })
        .limit(REPORT_LIMIT)

      if (range.from !== '') {
        query = query.gte('inwards.received_at', `${range.from}T00:00:00`)
      }
      if (range.to !== '') query = query.lt('inwards.received_at', endExclusive(range.to))
      if (supplierName) query = query.ilike('inwards.suppliers.name', `%${supplierName}%`)
      if (productId) query = query.eq('product_id', productId)

      const { data, error } = await query
      if (error) {
        logger.error('Inward report failed', toLogContext(error))
        throw error
      }

      return data.map((row) => {
        const prod = row.products as any
        const primaryCode = prod.product_barcodes?.find((b: any) => b.is_primary)?.code
        const anyCode = prod.product_barcodes?.[0]?.code

        return {
          id: row.id,
          inwardNo: row.inwards.inward_no,
          receivedAt: row.inwards.received_at,
          supplierName: row.inwards.suppliers?.name ?? null,
          productName: row.products.name,
          skuBarcode: primaryCode ?? anyCode ?? prod.product_code ?? '',
          quantity: row.quantity,
          invoiceNo: row.inwards.invoice_no,
          invoiceDate: row.inwards.invoice_date,
          purchaseOrderNo: row.inwards.purchase_order_no,
          broughtBy: row.inwards.brought_by
        }
      })
    }
  })
}

export interface OutwardRow {
  id: string
  outwardNo: string
  issuedAt: string
  partyName: string | null
  outwardType: string
  productName: string
  skuBarcode: string
  quantity: number
  invoiceNo: string | null
  salesOrderNo: string | null
  handedOverBy: string | null
  receivedBy: string | null
}

/** Dispatches, school/invoice/date/salesperson-wise (SRD §11; DSK-410). */
export function useOutwardReport(range: DateRange, partyName?: string, invoiceNo?: string, handedOverBy?: string) {
  return useQuery({
    queryKey: ['report', 'outward', range.from, range.to, partyName, invoiceNo, handedOverBy],
    staleTime: REPORT_STALE_TIME,
    queryFn: async (): Promise<OutwardRow[]> => {
      let query = supabase
        .from('outward_items')
        .select(
          'id, quantity, products!inner(name, product_code, product_barcodes(code, is_primary)), outwards!inner(outward_no, issued_at, outward_type, invoice_no, sales_order_no, handed_over_by, received_by, customers(name))'
        )
        .order('issued_at', { ascending: false, referencedTable: 'outwards' })
        .limit(REPORT_LIMIT)

      if (range.from !== '') query = query.gte('outwards.issued_at', `${range.from}T00:00:00`)
      if (range.to !== '') query = query.lt('outwards.issued_at', endExclusive(range.to))
      if (partyName) query = query.ilike('outwards.customers.name', `%${partyName}%`)
      if (invoiceNo) query = query.ilike('outwards.invoice_no', `%${invoiceNo}%`)
      if (handedOverBy) query = query.ilike('outwards.handed_over_by', `%${handedOverBy}%`)

      const { data, error } = await query
      if (error) {
        logger.error('Outward report failed', toLogContext(error))
        throw error
      }

      return data.map((row) => {
        const prod = row.products as any
        const primaryCode = prod.product_barcodes?.find((b: any) => b.is_primary)?.code
        const anyCode = prod.product_barcodes?.[0]?.code

        return {
          id: row.id,
          outwardNo: row.outwards.outward_no,
          issuedAt: row.outwards.issued_at,
          partyName: row.outwards.customers?.name ?? null,
          outwardType: row.outwards.outward_type,
          productName: row.products.name,
          skuBarcode: primaryCode ?? anyCode ?? prod.product_code ?? '',
          quantity: row.quantity,
          invoiceNo: row.outwards.invoice_no,
          salesOrderNo: row.outwards.sales_order_no,
          handedOverBy: row.outwards.handed_over_by,
          receivedBy: row.outwards.received_by
        }
      })
    }
  })
}

export interface ReportLookups {
  suppliers: string[]
  customers: string[]
  executives: string[]
  invoices: string[]
}

/** Fetches unique values for autocomplete dropdowns on the report filters. */
export function useReportLookups() {
  return useQuery({
    queryKey: ['report', 'lookups'],
    staleTime: REPORT_STALE_TIME,
    queryFn: async (): Promise<ReportLookups> => {
      // We can fetch unique names directly from the tables.
      const [suppliersReq, customersReq, inwardsReq, outwardsReq] = await Promise.all([
        supabase.from('suppliers').select('name').order('name'),
        supabase.from('customers').select('name').order('name'),
        supabase.from('inwards').select('brought_by, invoice_no'),
        supabase.from('outwards').select('handed_over_by, invoice_no')
      ])

      const suppliers = (suppliersReq.data ?? []).map((s) => s.name).filter((n): n is string => !!n)
      const customers = (customersReq.data ?? []).map((c) => c.name).filter((n): n is string => !!n)
      
      const executivesSet = new Set<string>()
      const invoicesSet = new Set<string>()

      for (const row of inwardsReq.data ?? []) {
        if (row.brought_by) executivesSet.add(row.brought_by)
        if (row.invoice_no) invoicesSet.add(row.invoice_no)
      }
      
      for (const row of outwardsReq.data ?? []) {
        if (row.handed_over_by) executivesSet.add(row.handed_over_by)
        if (row.invoice_no) invoicesSet.add(row.invoice_no)
      }

      return {
        suppliers,
        customers,
        executives: Array.from(executivesSet).sort(),
        invoices: Array.from(invoicesSet).sort()
      }
    }
  })
}
