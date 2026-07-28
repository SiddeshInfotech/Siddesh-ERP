-- =============================================================================
-- 28 — MAKE BATCH CODE UNIQUE PER PRODUCT
-- =============================================================================

-- 1. Drop the old global unique constraint
alter table public.product_batches drop constraint if exists uq_product_batches_code;

-- 2. Add the new unique constraint (product_id, code)
alter table public.product_batches add constraint uq_product_batches_code unique (product_id, code);

-- 3. Recreate save_inward to use the new conflict target (product_id, code)
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

  if app.replay_if_seen(p_client_txn_id) then
    return app.replay_result(p_client_txn_id);
  end if;

  v_resolved_batch_id := p_batch_id;

  -- Create batch if code provided but no ID
  if (v_resolved_batch_id is null and p_batch_code is not null) then
    insert into public.product_batches (code, product_id, status)
    values (p_batch_code, p_product_id, 'ACTIVE')
    on conflict (product_id, code) do update set updated_at = now()
    returning id into v_resolved_batch_id;
  end if;

  -- Insert barcodes for this batch
  if (p_barcodes is not null and array_length(p_barcodes, 1) > 0) then
    v_barcode_count := array_length(p_barcodes, 1);
    foreach v_bc in array p_barcodes loop
      insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary, status)
      values (p_product_id, v_bc, v_resolved_batch_id, 'CODE128', false, 'INWARDED')
      on conflict (code) do update set status = 'INWARDED';
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

    if not found then
      insert into public.suppliers (name, mobile)
      values (trim(p_supplier_name), p_supplier_mobile)
      returning id into v_supplier_id;
    end if;
  end if;

  v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');

  insert into public.inwards (
    office_id, inward_no, supplier_id, invoice_no, invoice_date, 
    purchase_order_no, brought_by, notes, invoice_file_path, 
    status, total_quantity
  ) values (
    v_office_id, v_inward_no, v_supplier_id, trim(p_invoice_no), p_invoice_date, 
    trim(p_purchase_order), trim(p_brought_by), trim(p_notes), trim(p_invoice_file_path), 
    'COMPLETED', p_qty
  ) returning id into v_inward_id;

  insert into public.inward_items (inward_id, product_id, quantity, batch_id, remarks)
  values (v_inward_id, p_product_id, p_qty, v_resolved_batch_id, trim(p_notes));

  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := p_product_id,
    p_unit_id       := null,
    p_txn_type      := 'INWARD',
    p_qty_delta     := p_qty,
    p_ref_type      := 'INWARD',
    p_ref_id        := v_inward_id,
    p_notes         := trim(p_notes),
    p_batch_id      := v_resolved_batch_id
  );

  return jsonb_build_object(
    'ok', true,
    'inward_id', v_inward_id,
    'ledger_id', v_ledger.id,
    'balance_after', v_ledger.balance_after,
    'replayed', false
  );
end;
$$;

-- 4. Re-grant execute to authenticated for save_inward
revoke all on function public.save_inward from public, anon;
grant execute on function public.save_inward to authenticated;
grant execute on function public.save_inward to service_role;

notify pgrst, 'reload schema';
