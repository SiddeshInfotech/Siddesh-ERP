-- =============================================================================
-- Migration 33: Update v_current_stock to include all products
--
-- The user requested that the Stock report show ALL products, even those that
-- have zero stock and have never been received. To accomplish this, we change
-- the base of v_current_stock from `stock_balances` to `products` CROSS JOIN
-- `offices` LEFT JOIN `stock_balances`. This ensures every product appears for
-- every office, with zero quantities where no balance record exists.
-- =============================================================================

drop view if exists public.v_current_stock cascade;

create or replace view public.v_current_stock as
select
  o.id as office_id,
  o.name as office_name,
  p.id as product_id,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  p.name as product_name,
  c.name as category_name,
  br.name as brand_name,
  u.code as uom_code,
  coalesce(b.qty_on_hand, 0) as qty_on_hand,
  coalesce(b.qty_reserved, 0) as qty_reserved,
  coalesce(b.qty_available, 0) as qty_available,
  p.min_stock,
  (coalesce(b.qty_available, 0) <= p.min_stock) as is_low_stock,
  coalesce(b.updated_at, p.updated_at) as updated_at
from public.products p
cross join public.offices o
left join public.stock_balances b on b.product_id = p.id and b.office_id = o.id
left join public.categories c on c.id = p.category_id
left join public.brands br on br.id = p.brand_id
left join public.uoms u on u.id = p.uom_id
where p.deleted_at is null;

grant select on public.v_current_stock to authenticated;
grant select on public.v_current_stock to service_role;
alter view public.v_current_stock set (security_invoker = on);

-- Recreate v_stock_dashboard which was cascaded
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
  cs.is_low_stock,
  pr.product_code
from public.v_current_stock cs
join public.products pr on pr.id = cs.product_id
left join (
  select
    product_id,
    office_id,
    coalesce(sum(qty_delta) filter (where txn_type = 'OPENING'), 0) as opening_qty,
    coalesce(sum(qty_delta) filter (where txn_type = 'INWARD'), 0)  as inward_qty,
    coalesce(-sum(qty_delta) filter (where txn_type = 'OUTWARD'), 0) as outward_qty
  from public.stock_ledger
  group by product_id, office_id
) m on m.product_id = cs.product_id and m.office_id = cs.office_id;

grant select on public.v_stock_dashboard to authenticated;
grant select on public.v_stock_dashboard to service_role;

notify pgrst, 'reload schema';
