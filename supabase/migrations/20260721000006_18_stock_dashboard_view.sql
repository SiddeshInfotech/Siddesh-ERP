-- =============================================================================
-- 18 — STOCK DASHBOARD VIEW
--
-- Extends v_current_stock with the movement breakdown the Stock screen needs
-- (SRD §7): Opening, Inward, Outward alongside Current / Reserved / Available.
--
-- The three flow columns are derived from the append-only stock_ledger and are
-- defined by sign so they ALWAYS reconcile:
--     Opening + Inward - Outward = Current (qty_on_hand)
-- Opening is the OPENING seed; Inward is every positive non-opening movement
-- (receipts, transfers-in, positive corrections); Outward is the magnitude of
-- every negative movement (dispatches, transfers-out, negative corrections).
-- Stock stays derived from the ledger (rule 0.7) — nothing is stored here.
-- =============================================================================

create or replace view public.v_stock_dashboard as
select
  cs.office_id,
  cs.office_name,
  cs.product_id,
  cs.sku_barcode,
  cs.product_name,
  cs.category_name,
  cs.brand_name,
  cs.uom_code,
  coalesce(m.opening_qty, 0) as opening_qty,
  coalesce(m.inward_qty, 0)  as inward_qty,
  coalesce(m.outward_qty, 0) as outward_qty,
  cs.qty_on_hand,
  cs.qty_reserved,
  cs.qty_available,
  cs.min_stock,
  cs.is_low_stock
from public.v_current_stock cs
left join (
  select
    product_id,
    office_id,
    coalesce(sum(qty_delta) filter (where txn_type = 'OPENING'), 0) as opening_qty,
    coalesce(sum(qty_delta) filter (where txn_type <> 'OPENING' and qty_delta > 0), 0) as inward_qty,
    coalesce(-sum(qty_delta) filter (where txn_type <> 'OPENING' and qty_delta < 0), 0) as outward_qty
  from public.stock_ledger
  group by product_id, office_id
) m on m.product_id = cs.product_id and m.office_id = cs.office_id;

grant select on public.v_stock_dashboard to authenticated;
grant select on public.v_stock_dashboard to service_role;

notify pgrst, 'reload schema';
