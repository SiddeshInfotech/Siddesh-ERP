-- =============================================================================
-- Migration 40: Strict Barcode Scanning Context
--
-- This migration updates `scan_receive` to require a document context 
-- ('INWARD' or 'OUTWARD') and a `document_id`. It strictly enforces that the
-- barcode being scanned actually belongs to the specified Inward/Outward
-- document before allowing the status transition.
-- =============================================================================

drop function if exists public.scan_receive(text, uuid, public.scan_source);

create or replace function public.scan_receive(
  p_code           text,
  p_client_txn_id  uuid,
  p_device_source  public.scan_source default 'MANUAL',
  p_scan_context   text default null, -- 'INWARD' or 'OUTWARD'
  p_document_id    uuid default null  -- The ID of the document (inward_item id or outward_item id, or inward_id/outward_id)
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid := app.current_office_id();
  v_bc        public.product_barcodes;
  v_existing  public.barcode_scans;
  v_new_status public.barcode_status;
  v_action    public.scan_action;
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

  -- If context is not provided, we reject to enforce strict usage
  if p_scan_context is null or p_document_id is null then
    return jsonb_build_object('ok', false, 'found', true, 'error', 'Scan rejected: Missing document context from the application.');
  end if;

  -- Determine action based on context
  if p_scan_context = 'INWARD' then
    if v_bc.status = 'INWARDED' or v_bc.status = 'IN_STOCK' then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;

    if v_bc.status <> 'GENERATED' then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode cannot be received: Current status is ' || v_bc.status);
    end if;

    -- Strict check: does this barcode's batch belong to the provided Inward document?
    select inward_id into v_ref_id 
    from public.inward_items 
    where batch_id = v_bc.batch_id 
      and (id = p_document_id or inward_id = p_document_id)
    limit 1;

    if v_ref_id is null then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Scan rejected: This barcode does not belong to the selected Inward document.');
    end if;

    v_new_status := 'INWARDED';
    v_action := 'RECEIVE';

  elsif p_scan_context = 'OUTWARD' then
    if v_bc.status = 'OUTWARDED' or v_bc.status = 'OUTWARD' then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;

    if v_bc.status <> 'IN_STOCK' and v_bc.status <> 'INWARDED' then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode cannot be issued: Current status is ' || v_bc.status);
    end if;

    -- Strict check: does this barcode's batch belong to the provided Outward document?
    select outward_id into v_ref_id 
    from public.outward_items 
    where batch_id = v_bc.batch_id 
      and (id = p_document_id or outward_id = p_document_id)
    limit 1;

    if v_ref_id is null then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Scan rejected: This barcode does not belong to the selected Outward document.');
    end if;

    v_new_status := 'OUTWARDED';
    v_action := 'ISSUE';
  else
    return jsonb_build_object('ok', false, 'found', true, 'error', 'Invalid scan context: ' || p_scan_context);
  end if;

  -- Update barcode status
  update public.product_barcodes set status = v_new_status where id = v_bc.id;

  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, v_action, p_device_source, p_client_txn_id
  );

  return jsonb_build_object('ok', true, 'found', true, 'already', false,
    'barcode_id', v_bc.id, 'product_id', v_bc.product_id, 'batch_id', v_bc.batch_id,
    'status', v_new_status, 'code', v_bc.code);
end;
$$;

revoke all on function public.scan_receive(text, uuid, public.scan_source, text, uuid) from public, anon;
grant execute on function public.scan_receive(text, uuid, public.scan_source, text, uuid) to authenticated;
grant execute on function public.scan_receive(text, uuid, public.scan_source, text, uuid) to service_role;

notify pgrst, 'reload schema';
