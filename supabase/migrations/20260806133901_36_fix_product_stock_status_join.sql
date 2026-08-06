-- =============================================================================
-- Migration 36: Fix v_product_stock_status to include all active products
--
-- The dashboard was excluding products that had no barcodes generated yet because
-- of an INNER JOIN. Changing to a LEFT JOIN ensures all active products are counted.
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
left join public.product_barcodes bc on bc.product_id = p.id
where p.deleted_at is null and p.is_active
group by p.id, p.name, p.min_stock;

grant select on public.v_product_stock_status to authenticated;
grant select on public.v_product_stock_status to service_role;

notify pgrst, 'reload schema';
