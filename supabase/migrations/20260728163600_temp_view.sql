-- Temporary views bypassing RLS for debugging
create or replace view public.temp_stock_balances as select * from public.stock_balances;

create or replace view public.temp_stock_ledger as select * from public.stock_ledger;

create or replace view public.temp_product_batches as select * from public.product_batches;

grant select on public.temp_stock_balances to anon, authenticated, service_role;

grant select on public.temp_stock_ledger to anon, authenticated, service_role;

grant select on public.temp_product_batches to anon, authenticated, service_role;
