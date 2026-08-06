-- =============================================================================
-- 48 — GLOBAL PER-PRODUCT STOCK STATUS (dashboard = all products, cumulative)
--
-- Client (06/08/2026): the dashboard must show CUMULATIVE all-products figures, not
-- one office's slice. The office-scoped views (v_current_stock, v_product_ledger)
-- gave a single-office headline while the barcode breakdown was system-wide — hence
-- "9 units / 1 product" next to "In stock 14".
--
-- This view is the barcode lifecycle rolled up per product, across every office —
-- the same globally-readable source (product_barcodes) the breakdown already uses,
-- so the dashboard's headline, breakdown, products-tracked, low- and out-of-stock all
-- agree. Only barcode-tracked products appear (INNER join); the whole dashboard model
-- is barcode-status based.
-- =============================================================================

create or replace view public.v_product_stock_status as
select
  p.id                                                             as product_id,
  p.name                                                           as product_name,
  p.min_stock,
  count(bc.id) filter (where bc.status in ('IN_STOCK', 'INWARDED')) as in_stock_units,
  count(bc.id) filter (where bc.status = 'GENERATED')              as generated_units,
  count(bc.id) filter (where bc.status in ('OUTWARD', 'OUTWARDED')) as outward_units,
  count(bc.id)                                                     as total_units
from public.products p
join public.product_barcodes bc on bc.product_id = p.id
where p.deleted_at is null and p.is_active
group by p.id, p.name, p.min_stock;

grant select on public.v_product_stock_status to authenticated;
grant select on public.v_product_stock_status to service_role;

notify pgrst, 'reload schema';
