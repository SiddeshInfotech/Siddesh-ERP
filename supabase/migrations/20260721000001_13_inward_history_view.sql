-- =============================================================================
-- INWARD HISTORY VIEW
-- Provides a clean, flat view of inward history including batch remaining quantities
-- =============================================================================

drop view if exists public.v_inward_history;

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
  ii.created_at
from public.inward_items ii
join public.inwards i on i.id = ii.inward_id
join public.products p on p.id = ii.product_id
left join public.product_batches pb on pb.id = ii.batch_id
left join public.v_stock_balances_by_batch sbb on sbb.batch_id = ii.batch_id and sbb.office_id = i.office_id
left join public.stock_balances sb on sb.product_id = ii.product_id and sb.office_id = i.office_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;

notify pgrst, 'reload schema';
