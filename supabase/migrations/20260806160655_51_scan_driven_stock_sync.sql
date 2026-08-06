-- =============================================================================
-- Migration 51: True Scan-Driven Stock Sync
--
-- Restores app.post_ledger calls inside scan_receive so that stock updates
-- happen exactly at the moment of scanning.
-- Reverts save_inward to skip ledger posts for barcoded items (so they can be
-- scanned to be received).
-- =============================================================================

-- 1. Revert save_inward logic to create barcodes as 'GENERATED' and skip ledger for them
create or replace function public.save_inward(
  p_client_txn_id     uuid,
  p_product_id        uuid,
  p_qty               integer,
  p_supplier_name     text,
  p_supplier_mobile   text default null,
  p_supplier_gst      text default null,
  p_invoice_no        text default null,
  p_invoice_date      date default null,
  p_purchase_order    text default null,
  p_brought_by        text default null,
  p_notes             text default null,
  p_invoice_file_path text default null,
  p_batch_id          uuid default null,
  p_batch_code        text default null,
  p_barcodes          text[] default null
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id   uuid;
  v_supplier_id uuid;
  v_inward_id   uuid;
  v_inward_no   text;
  v_ledger      public.stock_ledger;
  v_resolved_batch_id uuid;
  v_bc text;
  v_barcode_count integer := 0;
begin
  if (p_qty <= 0) then raise exception 'QTY_MUST_BE_POSITIVE'; end if;

  v_office_id := app.current_office_id();
  if (v_office_id is null) then raise exception 'NOT_IN_OFFICE'; end if;

  -- 1. Check ledger replay
  if app.replay_if_seen(p_client_txn_id) then
    return app.replay_result(p_client_txn_id);
  end if;

  -- 2. Check inwards replay (for barcoded inwards that didn't write to ledger)
  select id into v_inward_id from public.inwards where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object(
      'ok', true,
      'inward_id', v_inward_id,
      'ledger_id', null,
      'balance_after', coalesce((select qty_on_hand from public.stock_balances 
                                  where office_id = v_office_id 
                                    and product_id = p_product_id 
                                    and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_batch_id, '00000000-0000-0000-0000-000000000000'::uuid)), 0),
      'replayed', true
    );
  end if;

  v_resolved_batch_id := p_batch_id;

  if (v_resolved_batch_id is null and p_batch_code is not null) then
    insert into public.product_batches (code, product_id, status)
    values (p_batch_code, p_product_id, 'ACTIVE')
    on conflict (product_id, code) do update set updated_at = now()
    returning id into v_resolved_batch_id;
  end if;

  if (p_barcodes is not null and array_length(p_barcodes, 1) > 0) then
    v_barcode_count := array_length(p_barcodes, 1);
    foreach v_bc in array p_barcodes loop
      insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary, status, created_by, updated_by)
      values (p_product_id, v_bc, v_resolved_batch_id, 'CODE128', false, 'GENERATED', auth.uid(), auth.uid())
      on conflict (code) do update set status = 'GENERATED', updated_by = auth.uid();
    end loop;
  end if;

  if v_resolved_batch_id is not null then
    update public.product_batches
    set total_quantity = total_quantity + p_qty,
        generated_quantity = generated_quantity + v_barcode_count,
        remaining_quantity = remaining_quantity + p_qty,
        status = 'ACTIVE'
    where id = v_resolved_batch_id;
  end if;

  if p_supplier_name is not null and length(trim(p_supplier_name)) > 0 then
    select id into v_supplier_id
      from public.suppliers
     where lower(name) = lower(trim(p_supplier_name)) and deleted_at is null;

    if v_supplier_id is null then
      insert into public.suppliers (name, mobile, gst_no)
      values (trim(p_supplier_name), trim(p_supplier_mobile), trim(p_supplier_gst))
      returning id into v_supplier_id;
    end if;
  end if;

  v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');

  insert into public.inwards (
    client_txn_id, office_id, inward_no, supplier_id,
    invoice_no, invoice_date, purchase_order_no, brought_by, notes, invoice_file_path
  ) values (
    p_client_txn_id, v_office_id, v_inward_no, v_supplier_id,
    trim(p_invoice_no), p_invoice_date, trim(p_purchase_order), trim(p_brought_by), trim(p_notes), trim(p_invoice_file_path)
  ) returning id into v_inward_id;

  insert into public.inward_items (inward_id, product_id, quantity, batch_id)
  values (v_inward_id, p_product_id, p_qty, v_resolved_batch_id);

  if v_barcode_count = 0 then
    v_ledger := app.post_ledger(
      p_client_txn_id => p_client_txn_id, 
      p_office_id => v_office_id,
      p_product_id => p_product_id, 
      p_unit_id => null,
      p_txn_type => 'INWARD', 
      p_qty_delta => p_qty, 
      p_ref_type => 'INWARD',
      p_ref_id => v_inward_id,
      p_batch_id => v_resolved_batch_id
    );
    
    return jsonb_build_object(
      'ok', true,
      'inward_id', v_inward_id,
      'ledger_id', v_ledger.id,
      'balance_after', coalesce((select qty_on_hand from public.stock_balances 
                                  where office_id = v_office_id 
                                    and product_id = p_product_id 
                                    and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_batch_id, '00000000-0000-0000-0000-000000000000'::uuid)), 0),
      'replayed', false
    );
  else
    return jsonb_build_object(
      'ok', true,
      'inward_id', v_inward_id,
      'ledger_id', null,
      'balance_after', coalesce((select qty_on_hand from public.stock_balances 
                                  where office_id = v_office_id 
                                    and product_id = p_product_id 
                                    and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_batch_id, '00000000-0000-0000-0000-000000000000'::uuid)), 0),
      'replayed', false
    );
  end if;
end;
$$;

revoke all on function public.save_inward from public, anon;
grant execute on function public.save_inward to authenticated;
grant execute on function public.save_inward to service_role;

-- 2. Update scan_receive to call app.post_ledger
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

    v_new_status := 'AVAILABLE';
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

-- 3. Cleanup backfilled ledger entries from Migration 50 that haven't been scanned
do $$
declare
  r record;
begin
  for r in 
    select 
      sl.id, sl.product_id, sl.batch_id, sl.office_id, sl.qty_delta
    from public.stock_ledger sl
    where sl.txn_type = 'INWARD'
      and sl.batch_id is not null
      and not exists (
        select 1 from public.barcode_scans bs where bs.barcode_id in (select id from public.product_barcodes pb where pb.batch_id = sl.batch_id)
      )
  loop
    -- Post an adjustment to reverse the inward
    perform app.post_ledger(
      p_client_txn_id => gen_random_uuid(),
      p_office_id => r.office_id,
      p_product_id => r.product_id,
      p_unit_id => null,
      p_txn_type => 'ADJUSTMENT',
      p_qty_delta => -r.qty_delta,
      p_ref_type => 'ADJUSTMENT',
      p_ref_id => null,
      p_batch_id => r.batch_id
    );

    -- Revert the barcodes to GENERATED
    update public.product_barcodes pb
    set status = 'GENERATED'
    where pb.batch_id = r.batch_id
      and pb.status = 'AVAILABLE';
  end loop;
end;
$$;
