-- =============================================================================
-- 63 — Revert the scan_mobile "require a pre-existing document" guard (mig 61)
--
-- WHY
--   Migration 61 added two hard rejections to scan_mobile: an INWARD scan was
--   refused unless an inward_items row already existed for the unit's batch, and an
--   OUTWARD scan unless an outward_items row did. In the real workflow the desktop
--   creates the inward/outward entry first and staff then scan each unit to flip its
--   status — but those guards were rejecting valid scans, so the phone could no
--   longer receive or dispatch stock.
--
--   This restores the standalone behaviour from migration 59: the reference document
--   (inward_id / outward_id) is derived from the barcode's batch BEST-EFFORT. It is
--   nullable on stock_ledger, so a scan is still a valid, auditable movement — the
--   status flip, the ledger post, and the barcode_scans audit row all happen — even
--   when the paperwork row cannot be matched. The lifecycle guards that matter are
--   kept: INWARD requires status GENERATED, OUTWARD requires the unit to have been
--   inwarded first.
--
--   Only the two ref-resolution branches differ from migration 61 (each null-check
--   rejection is removed). Everything else — idempotency, status guards, ledger post,
--   audit row, grants — is identical.
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

  -- Idempotency: a scanner fires twice, or a flaky-wifi retry lands. One
  -- client_txn_id = one scan event; the second call returns the first result.
  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  -- Barcode codes are unique PER OFFICE (uq_product_barcode_code on office_id, code),
  -- so the lookup must be office-scoped or it could match another branch's unit.
  select * into v_bc
    from public.product_barcodes
   where code = p_code and office_id = v_office_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if p_direction = 'INWARD' then
    -- Already received: report success idempotently rather than as a failure.
    if v_bc.status in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    if v_bc.status <> 'GENERATED' then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'This unit cannot be received: its status is ' || v_bc.status || '.');
    end if;

    v_new_status := 'INWARDED';
    v_action     := 'RECEIVE';
    v_txn_type   := 'INWARD';
    v_qty_delta  := 1;
    -- Best-effort reference to the inward paperwork; null is acceptable (see header).
    select inward_id into v_ref_id
      from public.inward_items where batch_id = v_bc.batch_id limit 1;

  else  -- OUTWARD
    if v_bc.status in ('OUTWARDED', 'OUTWARD') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    -- THE GUARD: a unit must have been inwarded before it can go out.
    if v_bc.status not in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'This unit has not been inwarded yet, so it cannot be outwarded.');
    end if;

    v_new_status := 'OUTWARDED';
    v_action     := 'ISSUE';
    v_txn_type   := 'OUTWARD';
    v_qty_delta  := -1;
    -- Best-effort reference to the outward paperwork; null is acceptable (see header).
    select outward_id into v_ref_id
      from public.outward_items where batch_id = v_bc.batch_id limit 1;
  end if;

  update public.product_barcodes
     set status = v_new_status, updated_by = auth.uid(), updated_at = now()
   where id = v_bc.id;

  -- post_ledger derives balance_after and keeps stock_balances in step, under a row
  -- lock. p_ref_type is doc_ref_type; the stock_txn_type value shares the INWARD/OUTWARD
  -- labels, so cast through text (same approach the desktop scan path uses).
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

  -- The audit row: scanned_by + office_id + action feed the Inwarded / Outwarded /
  -- Scanned By / Scanned At columns on the history views and Batch Records.
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
