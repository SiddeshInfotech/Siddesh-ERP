-- =============================================================================
-- 58 — FIX scan_receive barcode_scans INSERT + BACKFILL scan audit (who/when/where)
--
-- BUG (verified on live data + packages/shared/database.types.ts)
--   scan_receive (migs 51 & 56) INSERTs into barcode_scans columns ref_context / ref_id
--   that DO NOT EXIST on the live table, and omits NOT NULL product_id. Because the
--   INSERT is inside the scan transaction, scan_receive rolls back — so a received unit
--   gets NO barcode_scans row (Batch Records' Inwarded / Scanned By / Scanned At stay
--   blank) and NO ledger row. Live barcode_scans columns are: barcode_id, product_id(NN),
--   batch_id, office_id(NN), action, device_source, client_txn_id, ledger_id, scanned_by,
--   scanned_at.
--
--   Migration 57 already reconciled the ledger; this migration fixes the scan write path
--   and backfills the who/when/where for units already received without a scan row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Authoritative scan_receive. Only the barcode_scans INSERT column list differs
--    from mig 56 (which named non-existent columns); the ledger post was correct.
-- -----------------------------------------------------------------------------
create or replace function public.scan_receive(
  p_code           text,
  p_client_txn_id  uuid,
  p_device_source  public.scan_source default 'MANUAL',
  p_scan_context   text default null,  -- 'INWARD' or 'OUTWARD'
  p_document_id    uuid default null   -- inward_id / outward_id of the open document
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id  uuid := app.current_office_id();
  v_bc         public.product_barcodes;
  v_existing   public.barcode_scans;
  v_new_status public.barcode_status;
  v_action     public.scan_action;
  v_ref_id     uuid;
  v_ledger     public.stock_ledger;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  select * into v_bc from public.product_barcodes where code = p_code;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if p_scan_context is null or p_document_id is null then
    return jsonb_build_object('ok', false, 'found', true,
      'error', 'Scan rejected: missing document context from the application.');
  end if;

  if p_scan_context = 'INWARD' then
    if v_bc.status in ('INWARDED', 'AVAILABLE', 'IN_STOCK') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    if v_bc.status <> 'GENERATED' then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'Barcode cannot be received: current status is ' || v_bc.status);
    end if;

    select inward_id into v_ref_id
      from public.inward_items
     where batch_id = v_bc.batch_id and (inward_id = p_document_id or id = p_document_id)
     limit 1;
    if v_ref_id is null then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'Barcode batch does not match the current Inward document.');
    end if;

    v_new_status := 'INWARDED';
    v_action     := 'RECEIVE';
    v_ledger := app.post_ledger(
      p_client_txn_id := public.uuid_generate_v5_compat(p_client_txn_id, v_bc.id::text),
      p_office_id := v_office_id, p_product_id := v_bc.product_id, p_unit_id := null,
      p_txn_type := 'INWARD', p_qty_delta := 1, p_ref_type := 'INWARD',
      p_ref_id := v_ref_id, p_batch_id := v_bc.batch_id
    );

  elsif p_scan_context = 'OUTWARD' then
    if v_bc.status in ('OUTWARDED', 'OUTWARD') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    if v_bc.status not in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'Barcode cannot be dispatched: current status is ' || v_bc.status);
    end if;

    select outward_id into v_ref_id
      from public.outward_items
     where batch_id = v_bc.batch_id and (outward_id = p_document_id or id = p_document_id)
     limit 1;
    if v_ref_id is null then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'Barcode batch does not match the current Outward document.');
    end if;

    v_new_status := 'OUTWARDED';
    v_action     := 'ISSUE';
    v_ledger := app.post_ledger(
      p_client_txn_id := public.uuid_generate_v5_compat(p_client_txn_id, v_bc.id::text),
      p_office_id := v_office_id, p_product_id := v_bc.product_id, p_unit_id := null,
      p_txn_type := 'OUTWARD', p_qty_delta := -1, p_ref_type := 'OUTWARD',
      p_ref_id := v_ref_id, p_batch_id := v_bc.batch_id
    );
  else
    return jsonb_build_object('ok', false, 'found', true, 'error', 'Unknown context: ' || p_scan_context);
  end if;

  update public.product_barcodes
     set status = v_new_status, updated_by = auth.uid(), updated_at = now()
   where id = v_bc.id;

  -- THE FIX: real columns. scanned_by + office_id feed Batch Records' "Scanned By"
  -- (profiles.full_name) and "Scanned At" (offices.name); action feeds inwarded_at /
  -- outwarded_at in v_batch_barcodes.
  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action,
    device_source, client_txn_id, ledger_id, scanned_by
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, v_action,
    p_device_source, p_client_txn_id, v_ledger.id, auth.uid()
  );

  return jsonb_build_object('ok', true, 'found', true, 'already', false,
    'barcode_id', v_bc.id, 'status', v_new_status, 'code', v_bc.code, 'ledger_id', v_ledger.id);
end;
$$;

revoke all on function public.scan_receive(text, uuid, public.scan_source, text, uuid) from public, anon;
grant execute on function public.scan_receive(text, uuid, public.scan_source, text, uuid) to authenticated;
grant execute on function public.scan_receive(text, uuid, public.scan_source, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Backfill a RECEIVE scan row for units already INWARDED/AVAILABLE/IN_STOCK with
--    none — so their Inwarded / Scanned By / Scanned At populate. Reconstructed from
--    data the DB actually recorded: who = product_barcodes.updated_by (audit trigger
--    stamped it when the status flipped), when = updated_at, where = the batch's
--    inward office. Idempotent (uuid_v5 + on conflict do nothing).
-- -----------------------------------------------------------------------------
insert into public.barcode_scans (
  barcode_id, product_id, batch_id, office_id, action,
  device_source, client_txn_id, ledger_id, scanned_by, scanned_at
)
select
  pb.id, pb.product_id, pb.batch_id,
  (select i.office_id from public.inward_items ii
     join public.inwards i on i.id = ii.inward_id
    where ii.batch_id = pb.batch_id order by i.received_at limit 1),
  'RECEIVE', 'MANUAL',
  public.uuid_generate_v5_compat(pb.id, 'backfill-58-receive'),
  null,
  coalesce(pb.updated_by, pb.created_by),
  coalesce(pb.updated_at, pb.created_at)
from public.product_barcodes pb
where pb.status in ('INWARDED', 'AVAILABLE', 'IN_STOCK')
  and pb.batch_id is not null
  and not exists (
    select 1 from public.barcode_scans s
     where s.barcode_id = pb.id and s.action = 'RECEIVE'
  )
  and (select i.office_id from public.inward_items ii
         join public.inwards i on i.id = ii.inward_id
        where ii.batch_id = pb.batch_id limit 1) is not null
on conflict (client_txn_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Belt-and-suspenders: re-run the idempotent ledger reconcile from mig 57 in case
--    that migration's applied version predated it. No-op when already correct.
-- -----------------------------------------------------------------------------
do $$
declare
  r record; v_current integer; v_delta integer;
begin
  for r in
    select
      (select i.office_id from public.inward_items ii
         join public.inwards i on i.id = ii.inward_id
        where ii.batch_id = pb.batch_id order by i.received_at limit 1) as office_id,
      pb.product_id, pb.batch_id, count(*) as target_qty
    from public.product_barcodes pb
    where pb.status in ('INWARDED', 'AVAILABLE', 'IN_STOCK') and pb.batch_id is not null
    group by pb.product_id, pb.batch_id
  loop
    if r.office_id is null then continue; end if;
    select coalesce(sum(qty_delta), 0) into v_current
      from public.stock_ledger
     where office_id = r.office_id and product_id = r.product_id
       and batch_id is not distinct from r.batch_id;
    v_delta := r.target_qty - v_current;
    if v_delta <> 0 then
      perform app.post_ledger(
        p_client_txn_id := gen_random_uuid(),
        p_office_id := r.office_id, p_product_id := r.product_id, p_unit_id := null,
        p_txn_type := 'ADJUSTMENT', p_qty_delta := v_delta,
        p_ref_type := 'ADJUSTMENT', p_ref_id := null,
        p_notes := 'Backfill mig 58: reconcile ledger to received barcodes',
        p_batch_id := r.batch_id
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
