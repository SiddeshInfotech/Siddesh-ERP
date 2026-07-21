-- =============================================================================
-- 19 — HUMAN-READABLE PRODUCT CODE (P00001, P00002, …)
--
-- The UUID id is stable but unreadable on a report. This adds a short, stable,
-- unique product_code that auto-assigns on insert exactly the way sku_barcode
-- does (a SECURITY DEFINER generator as the column DEFAULT), so a plain client
-- insert keeps getting one. Existing products are backfilled in creation order.
-- =============================================================================

create sequence if not exists app.product_code_seq;

-- Mirrors app.next_product_barcode(): definer-owned so the nextval works even
-- when an authenticated client does the insert directly.
create or replace function app.next_product_code()
  returns text language sql security definer set search_path = public, app as
$$ select 'P' || lpad(nextval('app.product_code_seq')::text, 5, '0') $$;

alter table public.products add column if not exists product_code text;

-- Backfill in a stable order so codes never shuffle on re-run.
with ordered as (
  select id, row_number() over (order by created_at, name, id) as rn
  from public.products
)
update public.products p
set product_code = 'P' || lpad(o.rn::text, 5, '0')
from ordered o
where o.id = p.id and p.product_code is null;

-- Continue the sequence past the highest backfilled code.
select setval('app.product_code_seq', greatest((select count(*) from public.products), 1));

alter table public.products alter column product_code set default app.next_product_code();
alter table public.products alter column product_code set not null;

do $$ begin
  alter table public.products add constraint uq_products_product_code unique (product_code);
exception when duplicate_object then null; end $$;

revoke all on function app.next_product_code() from public, anon;
grant execute on function app.next_product_code() to authenticated;
grant execute on function app.next_product_code() to service_role;

-- Expose product_code on the stock dashboard (appended — keeps existing columns).
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
    coalesce(sum(qty_delta) filter (where txn_type <> 'OPENING' and qty_delta > 0), 0) as inward_qty,
    coalesce(-sum(qty_delta) filter (where txn_type <> 'OPENING' and qty_delta < 0), 0) as outward_qty
  from public.stock_ledger
  group by product_id, office_id
) m on m.product_id = cs.product_id and m.office_id = cs.office_id;

grant select on public.v_stock_dashboard to authenticated;
grant select on public.v_stock_dashboard to service_role;

notify pgrst, 'reload schema';
