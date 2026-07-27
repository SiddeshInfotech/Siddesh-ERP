-- =============================================================================
-- 20 — BATCH BARCODE REGISTRY VIEW
--
-- Powers the Batch Registry table in the UI.
-- ONE ROW PER BATCH with product info + per-status barcode counts.
--
-- Design decisions:
--   • All aggregations happen here — no N+1 round trips in the frontend.
--   • COUNT … FILTER for status breakdown avoids a subquery per status.
--   • category_id is exposed so the frontend can filter by ID, not by name string.
--   • total_qty_on_hand sums stock_balances across ALL offices — the global
--     total for the product regardless of which office a user is in.
--   • Correlated subquery on stock_balances is safe: that table is small
--     (bounded by offices × products) and indexed on product_id.
--   • No RLS on this view; access is governed by the underlying tables,
--     which already have RLS enabled. authenticated users see all batches
--     that the existing product_batches policy allows (SELECT = true).
-- =============================================================================

create or replace view public.v_batch_registry as
select
  -- ── Batch ──────────────────────────────────────────────────────────────────
  bat.id                                                        as batch_id,
  bat.code                                                      as batch_code,
  bat.product_id,
  bat.created_at                                                as batch_created_at,
  bat.created_by                                                as batch_created_by,

  -- ── Product ────────────────────────────────────────────────────────────────
  p.name                                                        as product_name,
  p.sku_barcode,

  -- ── Category & Brand (all 4 format types need category for the pill) ───────
  p.category_id,
  c.name                                                        as category_name,
  br.name                                                       as brand_name,

  -- ── Barcode counts by lifecycle status ─────────────────────────────────────
  -- total_barcodes: how many sticker rows belong to this batch
  count(bc.id)                                                  as total_barcodes,

  -- Per-status breakdown: GENERATED, IN_STOCK, OUTWARD, VOID
  count(bc.id) filter (where bc.status = 'GENERATED')          as qty_generated,
  count(bc.id) filter (where bc.status = 'IN_STOCK')           as qty_in_stock,
  count(bc.id) filter (where bc.status = 'OUTWARD')            as qty_outward,
  count(bc.id) filter (where bc.status = 'VOID')               as qty_void,

  -- ── Barcode Initial — smallest code in the batch (consistent ordering) ─────
  min(bc.code)                                                  as first_barcode_code,

  -- ── Total product stock across all offices ─────────────────────────────────
  -- Derived from stock_balances cache (source of truth = stock_ledger).
  -- Uses SUM so an Admin sees Pune + Nashik + Aurangabad combined.
  coalesce((
    select sum(sb.qty_on_hand)
    from   public.stock_balances sb
    where  sb.product_id = p.id
  ), 0)                                                         as total_qty_on_hand

from      public.product_batches      bat
join      public.products             p   on p.id   = bat.product_id
left join public.categories           c   on c.id   = p.category_id
left join public.brands               br  on br.id  = p.brand_id
left join public.product_barcodes     bc  on bc.batch_id = bat.id

where p.deleted_at is null   -- never show batches for soft-deleted products

group by
  bat.id,  bat.code,  bat.product_id,  bat.created_at,  bat.created_by,
  p.name,  p.sku_barcode,  p.category_id,
  c.name,  br.name,
  p.id     -- needed for the correlated stock_balances subquery
;

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select on public.v_batch_registry to authenticated;
grant select on public.v_batch_registry to service_role;

notify pgrst, 'reload schema';
