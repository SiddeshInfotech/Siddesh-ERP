-- =============================================================================
-- 43 — FIX scan_receive: p_ref_type type mismatch
-- =============================================================================
-- Migration 40 redefined public.scan_receive to call app.post_ledger with
--   p_ref_type := v_txn_type
-- but v_txn_type is `stock_txn_type` while post_ledger declares p_ref_type as
-- `doc_ref_type`. Postgres finds no matching overload and raises
--   "function app.post_ledger(... p_ref_type => stock_txn_type ...) does not exist"
-- so every scan fails: no ledger row, no barcode_scans row, and the status update
-- rolls back. Both enums share the INWARD/OUTWARD labels, so cast through text.
--
-- This makes scan-driven stock work (desktop batch scan AND the mobile app): a scan
-- flips product_barcodes.status, records a barcode_scans row (which carries office_id
-- and scanned_at/by/device), and posts the ledger — so v_stock_balances_by_batch /
-- v_current_stock count the unit for the right office.

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
  v_ledger    public.stock_ledger;
  v_new_status public.barcode_status;
  v_action    public.scan_action;
  v_qty_delta integer;
  v_txn_type  public.stock_txn_type;
  v_ref_id    uuid;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  -- Idempotency check
  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  select * into v_bc from public.product_barcodes where code = p_code;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  -- Determine action, new status, and ledger impact based on current status
  if v_bc.status = 'GENERATED' then
    v_new_status := 'INWARDED';
    v_action := 'RECEIVE';
    v_qty_delta := 1;
    v_txn_type := 'INWARD';
  elsif v_bc.status in ('INWARDED', 'IN_STOCK') then
    v_new_status := 'OUTWARDED';
    v_action := 'ISSUE';
    v_qty_delta := -1;
    v_txn_type := 'OUTWARD';
  elsif v_bc.status in ('OUTWARDED', 'OUTWARD') then
    return jsonb_build_object('ok', true, 'found', true, 'already', true,
      'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
  else
    return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode has invalid status: ' || v_bc.status);
  end if;

  -- Resolve document reference (best effort)
  if v_txn_type = 'INWARD' then
    select inward_id into v_ref_id from public.inward_items where batch_id = v_bc.batch_id limit 1;
  elsif v_txn_type = 'OUTWARD' then
    select outward_id into v_ref_id from public.outward_items where batch_id = v_bc.batch_id limit 1;
  end if;

  -- Update barcode status
  update public.product_barcodes set status = v_new_status where id = v_bc.id;

  -- Post to stock ledger. p_ref_type is doc_ref_type; cast the stock_txn_type value
  -- through text (both enums share the INWARD/OUTWARD labels). THIS is the fix.
  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := v_bc.product_id,
    p_unit_id       := null,
    p_txn_type      := v_txn_type,
    p_qty_delta     := v_qty_delta,
    p_ref_type      := v_txn_type::text::public.doc_ref_type,
    p_ref_id        := v_ref_id,
    p_notes         := 'Scanned barcode ' || p_code,
    p_computer_name := null,
    p_batch_id      := v_bc.batch_id
  );

  -- Log scan event
  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id, ledger_id
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, v_action, p_device_source, p_client_txn_id, v_ledger.id
  );

  return jsonb_build_object('ok', true, 'found', true, 'already', false,
    'barcode_id', v_bc.id, 'product_id', v_bc.product_id, 'batch_id', v_bc.batch_id,
    'status', v_new_status, 'code', v_bc.code);
end;
$$;

notify pgrst, 'reload schema';
