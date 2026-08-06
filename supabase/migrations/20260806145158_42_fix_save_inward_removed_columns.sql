-- =============================================================================
-- Migration 42: Fix save_inward removed columns
--
-- Migration 37 inadvertently copy-pasted an older version of save_inward that
-- included `supplier_name`, `supplier_mobile`, and `supplier_gst` in the
-- inwards insert statement. These columns were normalized out of the inwards
-- table into the suppliers table in an earlier migration.
-- =============================================================================

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

  -- Create batch if code provided but no ID
  if (v_resolved_batch_id is null and p_batch_code is not null) then
    insert into public.product_batches (code, product_id, status)
    values (p_batch_code, p_product_id, 'ACTIVE')
    on conflict (product_id, code) do update set updated_at = now()
    returning id into v_resolved_batch_id;
  end if;

  -- Insert barcodes for this batch initially as 'GENERATED'
  if (p_barcodes is not null and array_length(p_barcodes, 1) > 0) then
    v_barcode_count := array_length(p_barcodes, 1);
    foreach v_bc in array p_barcodes loop
      insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary, status, created_by, updated_by)
      values (p_product_id, v_bc, v_resolved_batch_id, 'CODE128', false, 'GENERATED', auth.uid(), auth.uid())
      on conflict (code) do update set status = 'GENERATED', updated_by = auth.uid();
    end loop;
  end if;

  -- Update batch quantities
  if v_resolved_batch_id is not null then
    update public.product_batches
    set total_quantity = total_quantity + p_qty,
        generated_quantity = generated_quantity + v_barcode_count,
        remaining_quantity = remaining_quantity + p_qty,
        status = 'ACTIVE'
    where id = v_resolved_batch_id;
  end if;

  -- Find-or-create supplier
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

  -- Generate Document No
  v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');

  -- Create Inward Document (REMOVED supplier_name, mobile, gst_no)
  insert into public.inwards (
    client_txn_id, office_id, inward_no, supplier_id,
    invoice_no, invoice_date, purchase_order_no, brought_by, notes, invoice_file_path
  ) values (
    p_client_txn_id, v_office_id, v_inward_no, v_supplier_id,
    trim(p_invoice_no), p_invoice_date, trim(p_purchase_order), trim(p_brought_by), trim(p_notes), trim(p_invoice_file_path)
  ) returning id into v_inward_id;

  -- Add Inward Item
  insert into public.inward_items (inward_id, product_id, qty, batch_id)
  values (v_inward_id, p_product_id, p_qty, v_resolved_batch_id);

  -- Only post to stock ledger if NO barcodes were generated (i.e. bulk tracked).
  -- If barcodes exist, stock is recorded later when they are individually received via scan.
  if v_barcode_count = 0 then
    v_ledger := app.post_ledger(
      p_client_txn_id, p_product_id, v_resolved_batch_id, v_office_id,
      'INWARD', p_qty, null
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
