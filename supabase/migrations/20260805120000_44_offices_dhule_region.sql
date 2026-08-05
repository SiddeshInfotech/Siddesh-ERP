-- =============================================================================
-- 44 — OFFICE LIST: Dhule-region deployment
--
-- Client decision (05/08/2026): the live offices are Dhule Main, Dhule Branch,
-- Jalgaon, Pune. This replaces the original Pune/Nashik/Mumbai seed (08_seed.sql).
--
-- NO SCHEMA CHANGE. The multi-office model (offices table, office_id FKs, RLS via
-- app.can_access_office) already exists. This migration only edits DATA.
--
-- Safe to re-run: the three inserts are guarded by NOT EXISTS on a live code, the
-- Pune rename is guarded by its target value, and re-retiring an already-retired
-- office updates nothing new.
--
-- Nashik and Mumbai are SOFT-deleted (deleted_at), not dropped, because that is the
-- schema's documented removal path:
--   * offices_select RLS filters `deleted_at is null`, so they disappear from the UI.
--   * the uq_offices_code_live partial index only covers live rows, so their codes
--     are free to reuse later.
--   * nothing references them — 08_seed.sql posted opening stock to PUNE only, so no
--     stock_ledger / stock_balances / profiles row points at either. Soft delete is
--     reversible (clear deleted_at) if the client re-opens them.
-- =============================================================================

-- --- Add the three new offices ----------------------------------------------
-- code matches chk_offices_code  (^[A-Z0-9_]{2,10}$): DHULE_MAIN is exactly 10.
insert into public.offices (code, name, city, state)
select * from (values
  ('DHULE_MAIN', 'Dhule Main Office', 'Dhule',   'Maharashtra'),
  ('DHULE_BR',   'Dhule Branch',      'Dhule',   'Maharashtra'),
  ('JALGAON',    'Jalgaon',           'Jalgaon', 'Maharashtra')
) as v(code, name, city, state)
where not exists (
  select 1 from public.offices o where o.code = v.code and o.deleted_at is null
);

-- --- Pune stays, but Dhule Main is now the head/admin office -----------------
-- Drop the "Head Office" label the original seed gave Pune; it is general access now.
update public.offices
   set name = 'Pune Office'
 where code = 'PUNE' and deleted_at is null and name <> 'Pune Office';

-- --- Retire Nashik & Mumbai (soft delete + deactivate) -----------------------
update public.offices
   set deleted_at = now(),
       is_active  = false
 where code in ('NASHIK', 'MUMBAI') and deleted_at is null;
