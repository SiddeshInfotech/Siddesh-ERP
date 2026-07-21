-- =============================================================================
-- 17 — OUTWARD HISTORY VIEW
--
-- Mirrors v_inward_history so the Outward screen can have the same landing list
-- and tabbed history (Stock & Batches / Party / Other details). Grain: one row
-- per outward line (Date + Product + Batch). Party details come from `customers`
-- via `outwards.customer_id`; handover/doc details from `outwards`.
-- =============================================================================

create or replace view public.v_outward_history as
select
  oi.id,
  o.issued_at,
  o.outward_no,
  p.name as product_name,
  pb.code as batch_code,
  oi.quantity as outward_qty,
  coalesce(sbb.qty_on_hand, 0) as remaining_qty,
  coalesce(sb.qty_on_hand, 0) as total_qty,
  o.outward_type,
  oi.product_id,
  o.office_id,
  oi.created_at,
  -- party (Party tab)
  c.name           as party_name,
  c.contact_person as contact_person,
  c.mobile         as party_mobile,
  c.gst_no         as party_gst,
  c.address        as party_address,
  o.invoice_no,
  o.sales_order_no,
  -- handover / other (Other details tab)
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
  left join public.stock_balances sb on sb.product_id = oi.product_id and sb.office_id = o.office_id;

grant select on public.v_outward_history to authenticated;
grant select on public.v_outward_history to service_role;

notify pgrst, 'reload schema';
