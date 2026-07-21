import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SaveInwardResult, SaveOutwardResult } from '@siddesh/shared'
import type { Database } from '@siddesh/shared'
import { toLogContext } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

/**
 * Stock movement writes (DSK-308, DSK-318).
 *
 * Both go through the `security definer` RPCs — never `.from('stock_ledger').insert()`
 * (rule 0.2). RLS denies a direct write by design: only the RPCs validate, take the row lock
 * and stamp the audit trail, and only they can be trusted with stock.
 *
 * `clientTxnId` is a REQUIRED input, not something generated in here. That is rule 0.5: it
 * must be minted once per form submission, on mount, and reused on every retry. If this hook
 * called `crypto.randomUUID()` itself, each retry would mint a fresh id, the RPC's replay
 * check would never match, and a retried save would silently post stock twice. The whole
 * idempotency mechanism lives or dies on where that id is created.
 */

export type OutwardType = Database['public']['Enums']['outward_type']

export interface SaveInwardInput {
  clientTxnId: string
  productId: string
  qty: number
  supplierName: string
  supplierMobile: string | null
  supplierGst: string | null
  invoiceNo: string | null
  invoiceDate: string | null
  purchaseOrder: string | null
  broughtBy: string | null
  notes: string | null
  invoiceFilePath?: string | null
  batchId?: string | null
  batchCode?: string | null
  barcodes?: string[] | null
}

/**
 * Receives stock (SRD §5).
 *
 * @returns The ledger id and the product's new balance.
 * @throws The raw Supabase error for anything unexpected; the caller maps it via
 *         `lib/errors.toUserMessage`.
 *
 * Idempotent: the same clientTxnId returns the original result with `replayed: true` and
 * writes no second ledger row. See Document/Contract.md.
 */
export function useSaveInward() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveInwardInput): Promise<SaveInwardResult> => {
      const { data, error } = await supabase.rpc('save_inward', {
        p_client_txn_id: input.clientTxnId,
        p_product_id: input.productId,
        p_qty: input.qty,
        p_supplier_name: input.supplierName,
        ...(input.supplierMobile === null ? {} : { p_supplier_mobile: input.supplierMobile }),
        ...(input.supplierGst === null ? {} : { p_supplier_gst: input.supplierGst }),
        ...(input.invoiceNo === null ? {} : { p_invoice_no: input.invoiceNo }),
        ...(input.invoiceDate === null ? {} : { p_invoice_date: input.invoiceDate }),
        ...(input.purchaseOrder === null ? {} : { p_purchase_order: input.purchaseOrder }),
        ...(input.broughtBy === null ? {} : { p_brought_by: input.broughtBy }),
        ...(input.notes === null ? {} : { p_notes: input.notes }),
        ...(input.invoiceFilePath ? { p_invoice_file_path: input.invoiceFilePath } : {}),
        ...(input.batchId ? { p_batch_id: input.batchId } : {}),
        ...(input.batchCode ? { p_batch_code: input.batchCode } : {}),
        ...(input.barcodes ? { p_barcodes: input.barcodes } : {})
      })

      if (error) {
        logger.error('save_inward failed', {
          productId: input.productId,
          clientTxnId: input.clientTxnId,
          ...toLogContext(error)
        })
        throw error
      }

      const result = data as unknown as SaveInwardResult
      logger.info('Inward saved', {
        productId: input.productId,
        inwardId: result.inward_id,
        replayed: result.replayed
      })
      return result
    },
    onSuccess: () => invalidateStock(queryClient)
  })
}

export interface SaveOutwardInput {
  clientTxnId: string
  productId: string
  qty: number
  outwardType: OutwardType
  partyName: string | null
  contactPerson: string | null
  mobile: string | null
  partyGst: string | null
  partyAddress: string | null
  invoiceNo: string | null
  salesOrderNo: string | null
  handedOverBy: string | null
  receivedBy: string | null
  notes: string | null
  deliveryMethod: string | null
  batchId?: string | null
}

/**
 * Dispatches stock (SRD §6).
 *
 * @returns The ledger id and the product's new balance.
 * @throws INSUFFICIENT_STOCK when available < qty — a server decision taken under a row
 *         lock, never a client one. Callers detect it with `lib/errors.isInsufficientStock`
 *         and show "Only X left in stock" (DSK-319).
 *
 * Idempotent via clientTxnId. For a kit, one call posts a ledger row per component plus an
 * anchor row, all in one transaction (SRD §18A) — there is no half-sold kit.
 */
export function useSaveOutward() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveOutwardInput): Promise<SaveOutwardResult> => {
      const { data, error } = await supabase.rpc('save_outward', {
        p_client_txn_id: input.clientTxnId,
        p_product_id: input.productId,
        p_qty: input.qty,
        p_outward_type: input.outwardType,
        ...(input.partyName === null ? {} : { p_party_name: input.partyName }),
        ...(input.contactPerson === null ? {} : { p_contact_person: input.contactPerson }),
        ...(input.mobile === null ? {} : { p_mobile: input.mobile }),
        ...(input.partyGst === null ? {} : { p_party_gst: input.partyGst }),
        ...(input.partyAddress === null ? {} : { p_party_address: input.partyAddress }),
        ...(input.invoiceNo === null ? {} : { p_invoice_no: input.invoiceNo }),
        ...(input.salesOrderNo === null ? {} : { p_sales_order_no: input.salesOrderNo }),
        ...(input.handedOverBy === null ? {} : { p_handed_over_by: input.handedOverBy }),
        ...(input.receivedBy === null ? {} : { p_received_by: input.receivedBy }),
        ...(input.notes === null ? {} : { p_notes: input.notes }),
        ...(input.deliveryMethod === null ? {} : { p_delivery_method: input.deliveryMethod }),
        ...(input.batchId ? { p_batch_id: input.batchId } : {})
      })

      if (error) {
        // INSUFFICIENT_STOCK lands here too. It is an expected business outcome — the
        // concurrency guard doing its job — so it is logged at warn, not error.
        logger.warn('save_outward rejected', {
          productId: input.productId,
          clientTxnId: input.clientTxnId,
          ...toLogContext(error)
        })
        throw error
      }

      const result = data as unknown as SaveOutwardResult
      logger.info('Outward saved', {
        productId: input.productId,
        outwardId: result.outward_id,
        replayed: result.replayed
      })
      return result
    },
    onSuccess: () => invalidateStock(queryClient)
  })
}

/**
 * Drops every cached figure that a stock movement just invalidated.
 *
 * Stock is derived from the ledger (rule 0.7), so after a movement the product list, the
 * detail figure and any scan result are all stale. Missing one shows a storekeeper a
 * confidently wrong number.
 */
function invalidateStock(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['products'] })
  void queryClient.invalidateQueries({ queryKey: ['product-stock'] })
  void queryClient.invalidateQueries({ queryKey: ['scan-lookup'] })
}
