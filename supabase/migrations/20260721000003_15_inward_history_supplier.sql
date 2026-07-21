-- =============================================================================
-- 15 — v_inward_history: expose supplier + invoice/delivery details
--
-- The Inwards screen gains a second tab ("Supplier & Delivery") that lists, per
-- Date + Product, who supplied the goods and how they arrived. That data lives on
-- `inwards` (invoice_no/date, purchase_order_no, brought_by, notes) and on
-- `suppliers` via `inwards.supplier_id`. The view already has the right grain
-- (one row per inward line), so we only append columns — existing columns keep
-- their order, which is what `create or replace view` requires.
-- =============================================================================

create or replace view public.v_inward_history as
select
  ii.id,
  i.received_at,
  i.inward_no,
  p.name as product_name,
  pb.code as batch_code,
  ii.quantity as inward_qty,
  coalesce(sbb.qty_on_hand, 0) as remaining_qty,
  coalesce(sb.qty_on_hand, 0) as total_qty,
  i.brought_by,
  ii.product_id,
  i.office_id,
  ii.created_at,
  -- appended for the Supplier & Delivery tab
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
  left join public.stock_balances sb on sb.product_id = ii.product_id and sb.office_id = i.office_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;

notify pgrst, 'reload schema';
