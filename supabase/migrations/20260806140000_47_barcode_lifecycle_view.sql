-- =============================================================================
-- 47 — BARCODE LIFECYCLE VIEW (who / when / where, full lifecycle)
--
-- Client (06/08/2026): on the barcode record tables, show WHO changed a unit's
-- status and WHERE (the office of the logged-in device), plus the date/time of each
-- lifecycle stage — generated, inwarded, outwarded. Remove Symbology / Device /
-- Actions from those tables (done in the UI).
--
-- All the data already exists: product_barcodes.created_at/created_by is the
-- generation stamp; barcode_scans records every RECEIVE (inward) and ISSUE (outward)
-- with scanned_by + office_id. v_batch_barcodes (migration 16) surfaced only the
-- latest RECEIVE scan and no office. This redefinition adds the missing pieces
-- without touching any write path.
--
-- COLUMN ORDER MATTERS. `create or replace view` may only APPEND columns — it cannot
-- rename or reorder existing ones (Postgres 42P16). So the first ten columns are kept
-- byte-for-byte in the same order/name/type as migration 16, and the five new columns
-- are appended after them. The only change to an existing column is the EXPRESSION
-- behind scanned_at / device_source / scanned_by_name: they now reflect the most
-- RECENT scan of any action (previously RECEIVE-only) — i.e. whoever last changed the
-- status, which is exactly what "Scanned by" should show. Name/type/position are
-- unchanged, so replace is allowed.
-- =============================================================================

create or replace view public.v_batch_barcodes as
select
  -- ── Original columns (migration 16) — order/name/type unchanged ─────────────
  bc.id,
  bc.product_id,
  bc.batch_id,
  bc.code,
  bc.symbology,
  bc.status,
  bc.created_at,
  latest.scanned_at        as scanned_at,       -- now: most recent scan of any action
  latest.device_source     as device_source,    -- now: that scan's device
  scanner.full_name        as scanned_by_name,   -- now: who last changed the status
  -- ── Appended columns (new in migration 47) ──────────────────────────────────
  bc.created_at            as generated_at,      -- label created (generation stamp)
  gen.full_name            as generated_by_name,
  rcv.scanned_at           as inwarded_at,       -- most recent RECEIVE scan
  iss.scanned_at           as outwarded_at,      -- most recent ISSUE scan
  office.name              as scanned_office_name -- office of the last status change
from public.product_barcodes bc
left join public.profiles gen on gen.id = bc.created_by
left join lateral (
  select s.scanned_at
  from public.barcode_scans s
  where s.barcode_id = bc.id and s.action = 'RECEIVE'
  order by s.scanned_at desc
  limit 1
) rcv on true
left join lateral (
  select s.scanned_at
  from public.barcode_scans s
  where s.barcode_id = bc.id and s.action = 'ISSUE'
  order by s.scanned_at desc
  limit 1
) iss on true
left join lateral (
  select s.scanned_at, s.device_source, s.scanned_by, s.office_id
  from public.barcode_scans s
  where s.barcode_id = bc.id
  order by s.scanned_at desc
  limit 1
) latest on true
left join public.profiles scanner on scanner.id = latest.scanned_by
left join public.offices office on office.id = latest.office_id;

grant select on public.v_batch_barcodes to authenticated;
grant select on public.v_batch_barcodes to service_role;

notify pgrst, 'reload schema';
