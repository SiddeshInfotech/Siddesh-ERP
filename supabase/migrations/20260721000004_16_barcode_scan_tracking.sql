-- =============================================================================
-- 16 — BARCODE SCAN TRACKING (Phase 1 — verify mode, ledger untouched)
--
-- Goal: track each generated item barcode as a physical unit with a lifecycle,
-- and record a real audit trail when it is scanned (who / when / device) — so the
-- Batch Records table shows actual receiving, not static placeholders.
--
-- PHASE 1 (this migration) is deliberately NON-DESTRUCTIVE: scanning flips a
-- barcode GENERATED -> IN_STOCK and appends a scan event, but does NOT post to
-- stock_ledger. Today's save_inward already posts the full quantity at inward
-- time, so posting again on scan would double-count. The lifecycle here is a
-- physical-receipt indicator on top of that: an item barcode is "expected"
-- (GENERATED) at inward and only turns IN_STOCK when its unit is scanned in.
--
-- PHASE 2 (a later migration, applied only on sign-off) flips the model to
-- scan-driven stock: save_inward posts 0 for barcoded inwards and scan_receive
-- appends +1 per unit. That is the only change that rewrites ledger semantics,
-- so it is kept separate.
-- =============================================================================

-- 1. Enums ---------------------------------------------------------------------
do $$ begin
  create type public.barcode_status as enum ('GENERATED','IN_STOCK','OUTWARD','VOID');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scan_source as enum ('USB','BLUETOOTH','CAMERA','MANUAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scan_action as enum ('RECEIVE','ISSUE','VOID');
exception when duplicate_object then null; end $$;

-- 2. Lifecycle status on each item barcode ------------------------------------
alter table public.product_barcodes
  add column if not exists status public.barcode_status not null default 'GENERATED';

-- Item barcodes start life as GENERATED ("expected") and become IN_STOCK only
-- when the physical unit is scanned in (scan_receive). New rows already default
-- to GENERATED; this resets any that were previously marked, so every batch
-- opens with its units pending a scan.
update public.product_barcodes set status = 'GENERATED' where status <> 'GENERATED';

-- 3. Append-only scan events (same discipline as stock_ledger) ----------------
create table if not exists public.barcode_scans (
  id            uuid primary key default gen_random_uuid(),
  barcode_id    uuid not null references public.product_barcodes(id) on delete cascade,
  product_id    uuid not null references public.products(id),
  batch_id      uuid references public.product_batches(id),
  office_id     uuid not null references public.offices(id),
  action        public.scan_action not null,
  device_source public.scan_source not null default 'MANUAL',
  client_txn_id uuid not null,
  ledger_id     uuid references public.stock_ledger(id),
  scanned_by    uuid references auth.users(id) default auth.uid(),
  scanned_at    timestamptz not null default now(),
  constraint uq_barcode_scans_txn unique (client_txn_id)
);
create index if not exists ix_barcode_scans_barcode on public.barcode_scans (barcode_id);
create index if not exists ix_barcode_scans_batch on public.barcode_scans (batch_id);

alter table public.barcode_scans enable row level security;

-- Readable by any authenticated user (operational data, like product_barcodes).
drop policy if exists barcode_scans_select on public.barcode_scans;
create policy barcode_scans_select on public.barcode_scans
  for select to authenticated using (true);
-- No write policy on purpose: inserts happen only through scan_receive
-- (SECURITY DEFINER, owner bypass). Clients can never write scans directly.

-- 4. Display view: one row per barcode + its latest RECEIVE scan --------------
create or replace view public.v_batch_barcodes as
select
  bc.id,
  bc.product_id,
  bc.batch_id,
  bc.code,
  bc.symbology,
  bc.status,
  bc.created_at,
  ls.scanned_at,
  ls.device_source,
  pr.full_name as scanned_by_name
from public.product_barcodes bc
left join lateral (
  select s.scanned_at, s.device_source, s.scanned_by
  from public.barcode_scans s
  where s.barcode_id = bc.id and s.action = 'RECEIVE'
  order by s.scanned_at desc
  limit 1
) ls on true
left join public.profiles pr on pr.id = ls.scanned_by;

grant select on public.v_batch_barcodes to authenticated;
grant select on public.v_batch_barcodes to service_role;

-- 5. scan_receive — Phase 1 VERIFY mode ---------------------------------------
-- Flips GENERATED -> IN_STOCK and logs the scan. No ledger write (see header).
create or replace function public.scan_receive(
  p_code          text,
  p_client_txn_id uuid,
  p_device_source public.scan_source default 'MANUAL'
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid := app.current_office_id();
  v_bc        public.product_barcodes;
  v_existing  public.barcode_scans;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  -- Idempotency: a scanner can fire twice; one client_txn_id = one event.
  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  select * into v_bc from public.product_barcodes where code = p_code;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if v_bc.status = 'IN_STOCK' then
    return jsonb_build_object('ok', true, 'found', true, 'already', true,
      'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
  end if;

  update public.product_barcodes set status = 'IN_STOCK' where id = v_bc.id;

  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, 'RECEIVE', p_device_source, p_client_txn_id
  );

  return jsonb_build_object('ok', true, 'found', true, 'already', false,
    'barcode_id', v_bc.id, 'product_id', v_bc.product_id, 'batch_id', v_bc.batch_id,
    'status', 'IN_STOCK', 'code', v_bc.code);
end;
$$;

revoke all on function public.scan_receive(text, uuid, public.scan_source) from public, anon;
grant execute on function public.scan_receive(text, uuid, public.scan_source) to authenticated;
grant execute on function public.scan_receive(text, uuid, public.scan_source) to service_role;

notify pgrst, 'reload schema';
