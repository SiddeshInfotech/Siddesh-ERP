-- =============================================================================
-- 07 — ROW LEVEL SECURITY  (principles §15; client chat §11)
--
-- READ THIS FIRST.
--
-- The anon key is compiled into the Electron .exe and the Android APK. Both are
-- trivially unpacked (`npx asar extract` takes ~30 seconds). So the anon key IS
-- PUBLIC and always will be. That is fine and by design -- but ONLY because RLS
-- decides what each authenticated user can see.
--
-- With RLS off, the shipped anon key is a full database dump waiting to happen.
-- With RLS on, it can do nothing until a real user logs in, and then only within
-- that user's office.
--
-- RLS is not a hardening step to do "later". It is the security model.
--
-- Role summary:
--   ADMIN           — all offices (HQ dashboard, cross-office transfers)
--   STORE_MANAGER   — own office; may adjust stock
--   SALES_EXECUTIVE — own office; inward/outward only, no adjustments, no masters
-- =============================================================================

alter table public.offices           enable row level security;
alter table public.profiles          enable row level security;
alter table public.activity_logs     enable row level security;
alter table public.categories        enable row level security;
alter table public.brands            enable row level security;
alter table public.uoms              enable row level security;
alter table public.products          enable row level security;
alter table public.product_barcodes  enable row level security;
alter table public.product_units     enable row level security;
alter table public.kit_components    enable row level security;
alter table public.pendrive_details  enable row level security;
alter table public.suppliers         enable row level security;
alter table public.customers         enable row level security;
alter table public.inwards           enable row level security;
alter table public.inward_items      enable row level security;
alter table public.outwards          enable row level security;
alter table public.outward_items     enable row level security;
alter table public.transfers         enable row level security;
alter table public.transfer_items    enable row level security;
alter table public.stock_ledger      enable row level security;
alter table public.stock_balances    enable row level security;

-- DO NOT add `force row level security` to stock_ledger / stock_balances.
--
-- It looks like extra safety and is actually a footgun here. FORCE subjects the
-- table OWNER to RLS too -- and app.post_ledger() is a SECURITY DEFINER function
-- owned by that same role. Since there is deliberately no INSERT policy on these
-- tables, FORCE would make post_ledger fail with "new row violates row-level
-- security policy", i.e. every inward and outward in the system breaks.
--
-- The bypass-for-owner behaviour is exactly what we want: it is the mechanism
-- that lets the RPCs write while clients cannot. Clients connect as
-- `authenticated`, are not the owner, and are denied by the absence of an INSERT
-- policy. That is the whole design.


-- =============================================================================
-- ORG
-- =============================================================================

-- Everyone can see the office list (needed to pick a transfer destination).
create policy offices_select on public.offices
  for select to authenticated
  using (deleted_at is null);

create policy offices_write on public.offices
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Own profile always; Admin sees all; Store Manager sees their team.
-- NOTE: these predicates call app.* SECURITY DEFINER helpers rather than
-- selecting from profiles inline. An inline subquery on profiles inside a
-- profiles policy recurses infinitely and every query dies with a stack-depth
-- error. This is the #1 Supabase RLS foot-gun.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.is_admin()
    or (app.current_role() = 'STORE_MANAGER' and office_id = app.current_office_id())
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Users may edit their name/mobile but NOT promote themselves.
    and role = app.current_role()
    and office_id is not distinct from app.current_office_id()
  );

create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Audit log: readable by admins, insert-only via functions, never mutable.
create policy activity_select on public.activity_logs
  for select to authenticated
  using (app.is_admin() or (app.current_role() = 'STORE_MANAGER' and office_id = app.current_office_id()));


-- =============================================================================
-- MASTER DATA — global reads, admin writes
-- Products/categories/brands are shared across offices by design (client chat
-- §10 "centralized inventory database"). Only stock is office-scoped.
-- =============================================================================

create policy categories_select on public.categories
  for select to authenticated using (deleted_at is null);
create policy categories_write on public.categories
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

create policy brands_select on public.brands
  for select to authenticated using (deleted_at is null);
create policy brands_write on public.brands
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

create policy uoms_select on public.uoms
  for select to authenticated using (true);
create policy uoms_write on public.uoms
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy products_select on public.products
  for select to authenticated using (deleted_at is null);
create policy products_write on public.products
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

-- Barcodes must be readable by Sales Executives -- scanning is their whole job.
create policy product_barcodes_select on public.product_barcodes
  for select to authenticated using (true);
create policy product_barcodes_write on public.product_barcodes
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

-- Serial units: visible where they physically are, or to an Admin.
create policy product_units_select on public.product_units
  for select to authenticated
  using (deleted_at is null and (app.is_admin() or current_office_id = app.current_office_id() or current_office_id is null));
create policy product_units_write on public.product_units
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

create policy kit_components_select on public.kit_components
  for select to authenticated using (true);
create policy kit_components_write on public.kit_components
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

create policy pendrive_select on public.pendrive_details
  for select to authenticated using (true);
create policy pendrive_write on public.pendrive_details
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));


-- =============================================================================
-- PARTIES — global reads (a school may buy from any office), admin writes.
-- A Sales Executive cannot edit a customer record, but save_outward() creates one on their
-- behalf because it runs SECURITY DEFINER. That is the pattern: no direct write
-- rights, controlled writes through a function.
-- =============================================================================

create policy suppliers_select on public.suppliers
  for select to authenticated using (deleted_at is null);
create policy suppliers_write on public.suppliers
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

create policy customers_select on public.customers
  for select to authenticated using (deleted_at is null);
create policy customers_write on public.customers
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));


-- =============================================================================
-- DOCUMENTS — office-scoped reads. This is the "Office A cannot see Office B"
-- boundary from principles §15.
-- =============================================================================

create policy inwards_select on public.inwards
  for select to authenticated
  using (deleted_at is null and app.can_access_office(office_id));

create policy inward_items_select on public.inward_items
  for select to authenticated
  using (exists (
    select 1 from public.inwards i
     where i.id = inward_id and app.can_access_office(i.office_id)
  ));

create policy outwards_select on public.outwards
  for select to authenticated
  using (deleted_at is null and app.can_access_office(office_id));

create policy outward_items_select on public.outward_items
  for select to authenticated
  using (exists (
    select 1 from public.outwards o
     where o.id = outward_id and app.can_access_office(o.office_id)
  ));

-- A transfer is visible to BOTH ends -- the receiving office must see what's
-- inbound before it arrives.
create policy transfers_select on public.transfers
  for select to authenticated
  using (
    deleted_at is null
    and (app.can_access_office(from_office_id) or app.can_access_office(to_office_id))
  );

create policy transfer_items_select on public.transfer_items
  for select to authenticated
  using (exists (
    select 1 from public.transfers t
     where t.id = transfer_id
       and (app.can_access_office(t.from_office_id) or app.can_access_office(t.to_office_id))
  ));

-- NOTE: no INSERT/UPDATE policies on any document table. Documents are created
-- exclusively by the RPCs in 06_rpc.sql. A client trying
-- `.from('outwards').insert()` gets denied -- deliberately.


-- =============================================================================
-- LEDGER & BALANCES — read-only to clients, writes only via SECURITY DEFINER
--
-- THIS IS THE MOST IMPORTANT BLOCK IN THE FILE.
-- There is deliberately NO insert/update/delete policy. Postgres denies by
-- default once RLS is on, so the absence of a policy IS the denial. Stock can
-- only move through save_inward / save_outward / transfer_* / stock_adjust,
-- which validate, lock, and audit.
--
-- Never add a write policy here "to make something work".
-- =============================================================================

create policy ledger_select on public.stock_ledger
  for select to authenticated
  using (app.can_access_office(office_id));

create policy balances_select on public.stock_balances
  for select to authenticated
  using (app.can_access_office(office_id));


-- =============================================================================
-- VIEWS
-- Views run with the invoker's rights (security_invoker), so the underlying
-- table policies apply. Without this they'd run as the view owner and leak every
-- office's stock to everyone.
-- =============================================================================
alter view public.v_current_stock  set (security_invoker = on);
alter view public.v_product_ledger set (security_invoker = on);

grant select on public.v_current_stock  to authenticated;
grant select on public.v_product_ledger to authenticated;


-- =============================================================================
-- VERIFICATION — RUN THIS BEFORE GO-LIVE. NOT OPTIONAL.
--
-- 1. Log in as a SALES_EXECUTIVE user of Pune.
-- 2. Run:  select * from stock_balances;
--    EXPECT: only Pune rows. If you see Nashik, the policy is broken and the
--    database is effectively public to anyone who unpacks the .exe.
-- 3. Run:  insert into stock_ledger (...) values (...);
--    EXPECT: permission denied. If it succeeds, stock can be forged.
-- 4. Run:  select * from profiles;
--    EXPECT: only your own row. No stack-depth error (that means recursion).
--
-- A quick sanity check that every public table has RLS on:
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and rowsecurity = false;
--   -- must return ZERO rows
-- =============================================================================
