-- =============================================================================
-- Migration 53: Fix v_current_stock Row Level Security
--
-- Migration 52 introduced the CROSS JOIN and GROUP BY aggregation to correctly
-- compute stock per product per office. However, it omitted the 
-- `app.can_access_office(o.id)` condition on the CROSS JOIN.
-- Because offices is globally visible, the view bypassed RLS and showed all
-- branches' products to every user.
-- This migration re-adds the office RLS check to properly isolate data per branch.
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
  coalesce(sum(b.qty_on_hand), 0)::integer as qty_on_hand,
  coalesce(sum(b.qty_reserved), 0)::integer as qty_reserved,
  coalesce(sum(b.qty_available), 0)::integer as qty_available,
  p.min_stock,
  (coalesce(sum(b.qty_available), 0) <= p.min_stock) as is_low_stock,
  coalesce(max(b.updated_at), p.updated_at) as updated_at,
  coalesce(sum(b.damaged_quantity), 0)::integer as damaged_quantity
from public.products p
cross join public.offices o
left join public.stock_balances b on b.product_id = p.id and b.office_id = o.id
left join public.categories c on c.id = p.category_id
left join public.brands br on br.id = p.brand_id
left join public.uoms u on u.id = p.uom_id
where p.deleted_at is null
  and app.can_access_office(o.id)
group by
  o.id, o.name, p.id, p.product_code, p.name, c.name, br.name, u.code, p.min_stock, p.updated_at;

grant select on public.v_current_stock to authenticated;
grant select on public.v_current_stock to service_role;
alter view public.v_current_stock set (security_invoker = on);

-- Recreate v_stock_dashboard
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
alter view public.v_stock_dashboard set (security_invoker = on);

-- Recreate v_inward_history
create or replace view public.v_inward_history as
select
  ii.id,
  i.received_at,
  i.inward_no,
  p.name as product_name,
  pb.code as batch_code,
  ii.quantity as inward_qty,
  coalesce(ii.quantity - (select coalesce(sum(quantity), 0) from public.outward_items where batch_id = ii.batch_id), 0) as remaining_qty,
  coalesce(vcs.qty_on_hand, 0) as total_qty,
  i.brought_by,
  ii.product_id,
  i.office_id,
  ii.created_at,
  s.name             as supplier_name,
  s.mobile           as supplier_mobile,
  s.gst_no           as supplier_gst,
  s.address          as supplier_address,
  i.invoice_no,
  i.invoice_date,
  i.purchase_order_no,
  i.notes,
  i.invoice_file_path,
  ii.batch_id        as batch_id,
  coalesce(reg.total_barcodes, 0) as total_barcodes,
  coalesce(reg.qty_generated, 0) as qty_generated,
  coalesce(reg.qty_in_stock, 0) as qty_in_stock,
  coalesce(reg.qty_outward, 0) as qty_outward,
  coalesce(reg.qty_void, 0) as qty_void
from public.inward_items ii
  join public.inwards i on i.id = ii.inward_id
  join public.products p on p.id = ii.product_id
  left join public.product_batches pb on pb.id = ii.batch_id
  left join public.suppliers s on s.id = i.supplier_id
  left join public.v_current_stock vcs on vcs.product_id = ii.product_id and vcs.office_id = i.office_id
  left join public.v_batch_registry reg on reg.batch_id = ii.batch_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;
alter view public.v_inward_history set (security_invoker = on);

-- Recreate v_outward_history
create or replace view public.v_outward_history as
select
  oi.id,
  o.issued_at,
  o.outward_no,
  p.name as product_name,
  pb.code as batch_code,
  oi.quantity as outward_qty,
  coalesce((select coalesce(sum(quantity), 0) from public.inward_items where batch_id = oi.batch_id) - (select coalesce(sum(quantity), 0) from public.outward_items where batch_id = oi.batch_id), 0) as remaining_qty,
  coalesce(vcs.qty_on_hand, 0) as total_qty,
  o.outward_type,
  oi.product_id,
  o.office_id,
  oi.created_at,
  c.name           as party_name,
  c.contact_person as contact_person,
  c.mobile         as party_mobile,
  c.gst_no         as party_gst,
  c.address        as party_address,
  o.invoice_no,
  o.sales_order_no,
  o.handed_over_by,
  o.received_by,
  o.delivery_method,
  o.notes
from public.outward_items oi
  join public.outwards o on o.id = oi.outward_id
  join public.products p on p.id = oi.product_id
  left join public.product_batches pb on pb.id = oi.batch_id
  left join public.customers c on c.id = o.customer_id
  left join public.v_current_stock vcs on vcs.product_id = oi.product_id and vcs.office_id = o.office_id;

grant select on public.v_outward_history to authenticated;
grant select on public.v_outward_history to service_role;
alter view public.v_outward_history set (security_invoker = on);

notify pgrst, 'reload schema';
