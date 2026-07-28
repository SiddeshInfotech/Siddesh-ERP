-- =============================================================================
-- 27 — FIX HISTORY VIEWS CARTESIAN EXPLOSION
-- =============================================================================

-- Fix history views to prevent Cartesian explosion with batched stock balances.
-- Because stock_balances now has multiple rows per product (one per batch),
-- joining it directly causes duplicates. We join v_current_stock instead,
-- which aggregates the balances back down to one row per product.

create or replace view public.v_inward_history as
select
  ii.id,
  i.received_at,
  i.inward_no,
  p.name as product_name,
  pb.code as batch_code,
  ii.quantity as inward_qty,
  coalesce(sbb.qty_on_hand, 0) as remaining_qty,
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
  i.invoice_file_path
from public.inward_items ii
  join public.inwards i on i.id = ii.inward_id
  join public.products p on p.id = ii.product_id
  left join public.product_batches pb on pb.id = ii.batch_id
  left join public.suppliers s on s.id = i.supplier_id
  left join public.v_stock_balances_by_batch sbb on sbb.batch_id = ii.batch_id and sbb.office_id = i.office_id
  left join public.v_current_stock vcs on vcs.product_id = ii.product_id and vcs.office_id = i.office_id;

create or replace view public.v_outward_history as
select
  oi.id,
  o.issued_at,
  o.outward_no,
  p.name as product_name,
  pb.code as batch_code,
  oi.quantity as outward_qty,
  coalesce(sbb.qty_on_hand, 0) as remaining_qty,
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
  left join public.v_stock_balances_by_batch sbb on sbb.batch_id = oi.batch_id and sbb.office_id = o.office_id
  left join public.v_current_stock vcs on vcs.product_id = oi.product_id and vcs.office_id = o.office_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;
grant select on public.v_outward_history to authenticated;
grant select on public.v_outward_history to service_role;

notify pgrst, 'reload schema';
