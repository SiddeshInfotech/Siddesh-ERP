-- =============================================================================
-- 61 — scan_mobile: REQUIRE a matching inward/outward entry before moving stock
--
-- WHY (count-integrity bug)
--   scan_mobile (mig 59) derived the reference document from the barcode's batch but
--   proceeded even when none was found (ref_id null). So an OUTWARD scan could dispatch a
--   unit for which NO outward entry exists: the ledger dropped stock, but there was no
--   outward paperwork, so v_outward_history never showed it and the counts diverged.
--
--   New rule: a scan may only move stock that has a matching entry in the system.
--     • INWARD  requires an inward_items row for the unit's batch.
--     • OUTWARD requires an outward_items row for the unit's batch.
--   Missing either → the scan is rejected with a generic warning; nothing is written, no
--   status flips, no ledger row. This is the guard the operator asked for: "if the entry
--   isn't created in the DB, don't allow the inward/outward."
--
--   Only the two ref-resolution branches change from mig 59 (a null check is added after
--   each). Everything else — idempotency, status guards, ledger post, audit row — is
--   identical.
-- =============================================================================

create or replace function public.scan_mobile(
  p_code           text,
  p_client_txn_id  uuid,
  p_direction      text,                               -- 'INWARD' | 'OUTWARD'
  p_device_source  public.scan_source default 'CAMERA'
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id  uuid := app.current_office_id();
  v_bc         public.product_barcodes;
  v_existing   public.barcode_scans;
  v_new_status public.barcode_status;
  v_action     public.scan_action;
  v_txn_type   public.stock_txn_type;
  v_qty_delta  integer;
  v_ref_id     uuid;
  v_ledger     public.stock_ledger;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  if p_direction not in ('INWARD', 'OUTWARD') then
    return jsonb_build_object('ok', false, 'error', 'Unknown scan mode: ' || coalesce(p_direction, 'null'));
  end if;

  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  select * into v_bc
    from public.product_barcodes
   where code = p_code and office_id = v_office_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if p_direction = 'INWARD' then
    if v_bc.status in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    if v_bc.status <> 'GENERATED' then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'This unit cannot be received: its status is ' || v_bc.status || '.');
    end if;

    -- GUARD: an inward entry for this item must exist in the system.
    select inward_id into v_ref_id
      from public.inward_items where batch_id = v_bc.batch_id limit 1;
    if v_ref_id is null then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'No inward entry has been created for this item yet. Create the entry first, then scan.');
    end if;

    v_new_status := 'INWARDED';
    v_action     := 'RECEIVE';
    v_txn_type   := 'INWARD';
    v_qty_delta  := 1;

  else  -- OUTWARD
    if v_bc.status in ('OUTWARDED', 'OUTWARD') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    if v_bc.status not in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'This unit has not been inwarded yet, so it cannot be outwarded.');
    end if;

    -- GUARD: an outward entry for this item must exist in the system. This is the fix for
    -- the count bug — you cannot dispatch a unit that has no outward paperwork.
    select outward_id into v_ref_id
      from public.outward_items where batch_id = v_bc.batch_id limit 1;
    if v_ref_id is null then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'No outward entry has been created for this item yet. Create the entry first, then scan.');
    end if;

    v_new_status := 'OUTWARDED';
    v_action     := 'ISSUE';
    v_txn_type   := 'OUTWARD';
    v_qty_delta  := -1;
  end if;

  update public.product_barcodes
     set status = v_new_status, updated_by = auth.uid(), updated_at = now()
   where id = v_bc.id;

  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := v_bc.product_id,
    p_unit_id       := null,
    p_txn_type      := v_txn_type,
    p_qty_delta     := v_qty_delta,
    p_ref_type      := v_txn_type::text::public.doc_ref_type,
    p_ref_id        := v_ref_id,
    p_notes         := 'Mobile scan (' || p_direction || ') ' || p_code,
    p_computer_name := null,
    p_batch_id      := v_bc.batch_id
  );

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

revoke all on function public.scan_mobile(text, uuid, text, public.scan_source) from public, anon;
grant execute on function public.scan_mobile(text, uuid, text, public.scan_source) to authenticated;
grant execute on function public.scan_mobile(text, uuid, text, public.scan_source) to service_role;

notify pgrst, 'reload schema';
