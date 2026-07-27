-- =============================================================================
-- Migration 25: Drop obsolete sku_barcode column from products table
--
-- Since product_code (e.g. P00017) serves as the unique product identifier and
-- all actual barcodes are managed exclusively in product_barcodes and the Barcodes
-- module, sku_barcode on public.products is redundant storage.
--
-- We drop sku_barcode cascade and update all reporting views (v_current_stock,
-- v_stock_dashboard, v_product_ledger, v_batch_registry) and scan_lookup to
-- dynamically resolve barcodes from product_barcodes (with product_code fallback).
-- =============================================================================

-- 1. Drop index and column
drop index if exists public.uq_products_sku_live;
alter table public.products drop column if exists sku_barcode cascade;

-- 2. Recreate v_current_stock
create or replace view public.v_current_stock as
select
  b.office_id,
  o.name  as office_name,
  b.product_id,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  p.name  as product_name,
  c.name  as category_name,
  br.name as brand_name,
  u.code  as uom_code,
  b.qty_on_hand,
  b.qty_reserved,
  b.qty_available,
  p.min_stock,
  (b.qty_available <= p.min_stock) as is_low_stock,
  b.updated_at
from public.stock_balances b
join public.products  p  on p.id  = b.product_id
join public.offices   o  on o.id  = b.office_id
left join public.categories c on c.id = p.category_id
left join public.brands     br on br.id = p.brand_id
left join public.uoms       u  on u.id  = p.uom_id
where p.deleted_at is null;

grant select on public.v_current_stock to authenticated;
grant select on public.v_current_stock to service_role;

-- 3. Recreate v_stock_dashboard
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

-- 4. Recreate v_product_ledger
create or replace view public.v_product_ledger as
select
  l.id,
  l.occurred_at,
  l.office_id,
  o.name as office_name,
  l.product_id,
  p.name as product_name,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  l.txn_type,
  l.qty_delta,
  l.balance_after,
  l.ref_type,
  l.ref_id,
  coalesce(s.name, cu.name) as party_name,
  pr.full_name as created_by_name,
  l.notes
from public.stock_ledger l
join public.products p on p.id = l.product_id
join public.offices  o on o.id = l.office_id
left join public.profiles pr on pr.id = l.created_by
left join public.inwards  i  on l.ref_type = 'INWARD'  and i.id = l.ref_id
left join public.suppliers s on s.id = i.supplier_id
left join public.outwards ow on l.ref_type = 'OUTWARD' and ow.id = l.ref_id
left join public.customers cu on cu.id = ow.customer_id;

grant select on public.v_product_ledger to authenticated;
grant select on public.v_product_ledger to service_role;

-- 5. Recreate v_batch_registry
create or replace view public.v_batch_registry as
select
  bat.id                                                        as batch_id,
  bat.code                                                      as batch_code,
  bat.product_id,
  bat.created_at                                                as batch_created_at,
  bat.created_by                                                as batch_created_by,
  p.name                                                        as product_name,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  p.category_id,
  c.name                                                        as category_name,
  br.name                                                       as brand_name,
  count(bc.id)                                                  as total_barcodes,
  count(bc.id) filter (where bc.status = 'GENERATED')          as qty_generated,
  count(bc.id) filter (where bc.status = 'IN_STOCK')           as qty_in_stock,
  count(bc.id) filter (where bc.status = 'OUTWARD')            as qty_outward,
  count(bc.id) filter (where bc.status = 'VOID')               as qty_void,
  min(bc.code)                                                  as first_barcode_code,
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
where p.deleted_at is null
group by
  bat.id,  bat.code,  bat.product_id,  bat.created_at,  bat.created_by,
  p.name,  p.id,  p.product_code,  p.category_id,
  c.name,  br.name;

grant select on public.v_batch_registry to authenticated;
grant select on public.v_batch_registry to service_role;

-- 6. Update scan_lookup
drop function if exists public.scan_lookup cascade;
create or replace function public.scan_lookup(p_code text) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_product record;
  v_unit    record;
  v_batch   record;
  v_stock   record;
  v_office_id uuid;
begin
  v_office_id := app.current_office_id();
  if (v_office_id is null) then raise exception 'NOT_IN_OFFICE'; end if;

  select p.*, b.batch_id into v_product
    from public.product_barcodes b
    join public.products p on p.id = b.product_id
   where b.code = p_code 
     and p.deleted_at is null
   limit 1;

  if (v_product is null) then
    select p.* into v_product
      from public.product_units u
      join public.products p on p.id = u.product_id
     where u.unit_barcode = p_code and u.deleted_at is null
     limit 1;
    if (v_product is not null) then
      select * into v_unit from public.product_units where unit_barcode = p_code limit 1;
    end if;
  end if;

  if (v_product is null) then
    select * into v_product
      from public.products p
     where p.product_code = p_code and p.deleted_at is null
     limit 1;
  end if;

  if (v_product is null) then
    return jsonb_build_object('found', false);
  end if;

  if v_product.batch_id is not null then
    select * into v_batch from public.product_batches where id = v_product.batch_id limit 1;
  end if;

  select * into v_stock from public.v_stock_balances
   where office_id = v_office_id and product_id = v_product.id;

  return jsonb_build_object(
    'found', true,
    'match_type', case when v_unit is not null then 'UNIT' else 'PRODUCT' end,
    'product', jsonb_build_object(
      'id',          v_product.id,
      'sku_barcode', coalesce((select pb.code from public.product_barcodes pb where pb.product_id = v_product.id and pb.is_primary = true limit 1), v_product.product_code),
      'name',        v_product.name,
      'unit',        (select code from public.uoms where id = v_product.uom_id),
      'is_kit',      v_product.is_kit,
      'tracking_mode', v_product.tracking_mode
    ),
    'unit', case when v_unit is not null then
      jsonb_build_object(
        'id',           v_unit.id,
        'serial_no',    v_unit.serial_no,
        'unit_barcode', v_unit.unit_barcode,
        'status',       v_unit.status
      ) else null end,
    'batch', case when v_batch is not null then
      jsonb_build_object(
        'id',   v_batch.id,
        'code', v_batch.code
      ) else null end,
    'stock', jsonb_build_object(
      'qty_on_hand',   coalesce(v_stock.qty_on_hand, 0),
      'qty_allocated', coalesce(v_stock.qty_allocated, 0),
      'qty_available', coalesce(v_stock.qty_available, 0)
    )
  );
end;
$$;

revoke all on function public.scan_lookup from public, anon;
grant execute on function public.scan_lookup to authenticated;
grant execute on function public.scan_lookup to service_role;

notify pgrst, 'reload schema';
