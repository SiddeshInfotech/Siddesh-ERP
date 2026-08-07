-- 56 - scan_receive to INWARDED instead of AVAILABLE
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
  v_ledger    public.stock_ledger;
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
    return jsonb_build_object('ok', false, 'found', true, 'error', 'Scan rejected: Missing document context from the application.');
  end if;

  if p_scan_context = 'INWARD' then
    if v_bc.status = 'INWARDED' or v_bc.status = 'AVAILABLE' or v_bc.status = 'IN_STOCK' then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;

    if v_bc.status <> 'GENERATED' then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode cannot be received: Current status is ' || v_bc.status);
    end if;

    select inward_id into v_ref_id 
    from public.inward_items 
    where inward_id = p_document_id and batch_id = v_bc.batch_id limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode batch does not match the current Inward Document.');
    end if;

    v_new_status := 'INWARDED';
    v_action := 'RECEIVE';

    v_ledger := app.post_ledger(
      p_client_txn_id => public.uuid_generate_v5_compat(p_client_txn_id, v_bc.id::text),
      p_office_id => v_office_id,
      p_product_id => v_bc.product_id,
      p_unit_id => null,
      p_txn_type => 'INWARD',
      p_qty_delta => 1,
      p_ref_type => 'INWARD',
      p_ref_id => v_ref_id,
      p_batch_id => v_bc.batch_id
    );

  elsif p_scan_context = 'OUTWARD' then
    if v_bc.status = 'OUTWARDED' or v_bc.status = 'OUTWARD' or v_bc.status = 'DISPATCHED' then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;

    if v_bc.status not in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode cannot be dispatched: Current status is ' || v_bc.status);
    end if;

    select outward_id into v_ref_id 
    from public.outward_items 
    where outward_id = p_document_id and batch_id = v_bc.batch_id limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'found', true, 'error', 'Barcode batch does not match the current Outward Document.');
    end if;

    v_new_status := 'OUTWARDED';
    v_action := 'ISSUE';

    v_ledger := app.post_ledger(
      p_client_txn_id => public.uuid_generate_v5_compat(p_client_txn_id, v_bc.id::text),
      p_office_id => v_office_id,
      p_product_id => v_bc.product_id,
      p_unit_id => null,
      p_txn_type => 'OUTWARD',
      p_qty_delta => -1,
      p_ref_type => 'OUTWARD',
      p_ref_id => v_ref_id,
      p_batch_id => v_bc.batch_id
    );
  else
    return jsonb_build_object('ok', false, 'found', true, 'error', 'Unknown context: ' || p_scan_context);
  end if;

  update public.product_barcodes
     set status = v_new_status,
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_bc.id;

  insert into public.barcode_scans (
    client_txn_id, barcode_id, device_source, action, ref_context, ref_id, scanned_by, office_id
  ) values (
    p_client_txn_id, v_bc.id, p_device_source, v_action, p_scan_context, v_ref_id, auth.uid(), v_office_id
  );

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'already', false,
    'barcode_id', v_bc.id,
    'status', v_new_status,
    'code', v_bc.code,
    'ledger_id', v_ledger.id
  );
end;
$$;

revoke all on function public.scan_receive(text, uuid, public.scan_source, text, uuid) from public, anon;
grant execute on function public.scan_receive(text, uuid, public.scan_source, text, uuid) to authenticated;
grant execute on function public.scan_receive(text, uuid, public.scan_source, text, uuid) to service_role;
