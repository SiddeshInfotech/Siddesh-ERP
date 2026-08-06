-- =============================================================================
-- 46 — DASHBOARD SUPPORT VIEWS (read-side only, no write path touched)
--
-- Two thin views for the reworked dashboard (client chat 06/08/2026):
--   1. v_barcode_status_summary — system-wide unit counts by lifecycle status, for
--      the "Current stock" card's Generated / In-stock / Outward breakdown.
--   2. v_batch_activity — batches that have had at least one status change (a scan),
--      newest activity first, for the dashboard's batch-activity table.
--
-- Both are pure SELECTs over existing tables/views. Barcode lifecycle vocabulary
-- drifted across migrations (GENERATED/IN_STOCK/OUTWARD vs INWARDED/OUTWARDED); the
-- same normalisation as v_batch_registry (migration 37) is applied — received → in
-- stock, issued → out.
-- =============================================================================

-- 1. Unit counts by lifecycle status ------------------------------------------
-- One row. A dashboard hint, so it stays a system-wide count of barcoded units;
-- the office-scoped "in stock" figure is the card's headline, from v_current_stock.
create or replace view public.v_barcode_status_summary as
select
  count(*) filter (where status = 'GENERATED')                as qty_generated,
  count(*) filter (where status in ('IN_STOCK', 'INWARDED'))  as qty_in_stock,
  count(*) filter (where status in ('OUTWARD', 'OUTWARDED'))  as qty_outward,
  count(*) filter (where status = 'VOID')                     as qty_void,
  count(*)                                                    as total_units
from public.product_barcodes;

grant select on public.v_barcode_status_summary to authenticated;
grant select on public.v_barcode_status_summary to service_role;

-- 2. Batches with a status change, most-recent activity first -----------------
-- INNER join to the scan aggregate: a batch appears only once one of its units has
-- actually been scanned (inwarded or outwarded) — i.e. its status changed. Batches
-- that are only generated-and-printed never appear, matching "batches where inward
-- and outward status changes".
create or replace view public.v_batch_activity as
select
  r.*,
  s.last_activity_at
from public.v_batch_registry r
join (
  select batch_id, max(scanned_at) as last_activity_at
  from public.barcode_scans
  where batch_id is not null
  group by batch_id
) s on s.batch_id = r.batch_id;

grant select on public.v_batch_activity to authenticated;
grant select on public.v_batch_activity to service_role;

notify pgrst, 'reload schema';
