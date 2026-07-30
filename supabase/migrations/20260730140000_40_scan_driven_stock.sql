-- =============================================================================
-- 40 — SCAN-DRIVEN STOCK MANAGEMENT
-- =============================================================================

-- 1. Redefine save_inward to skip posting to ledger if barcodes exist
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
    on conflict (code) do update set updated_at = now()
    returning id into v_resolved_batch_id;
  end if;

  -- Insert barcodes for this batch initially as 'GENERATED'
  if (p_barcodes is not null and array_length(p_barcodes, 1) > 0) then
    v_barcode_count := array_length(p_barcodes, 1);
    foreach v_bc in array p_barcodes loop
      insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary, status)
      values (p_product_id, v_bc, v_resolved_batch_id, 'CODE128', false, 'GENERATED')
      on conflict (code) do update set status = 'GENERATED';
    end loop;
  end if;

  -- Update batch quantities (keep batch intact)
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
    client_txn_id, office_id, inward_no, supplier_id, invoice_no, invoice_date, 
    purchase_order_no, brought_by, notes, invoice_file_path, 
    status, total_quantity
  ) values (
    p_client_txn_id, v_office_id, v_inward_no, v_supplier_id, trim(p_invoice_no), p_invoice_date, 
    trim(p_purchase_order), trim(p_brought_by), trim(p_notes), trim(p_invoice_file_path), 
    'COMPLETED', p_qty
  ) returning id into v_inward_id;

  insert into public.inward_items (inward_id, product_id, quantity, batch_id, remarks)
  values (v_inward_id, p_product_id, p_qty, v_resolved_batch_id, trim(p_notes));

  -- Only post to ledger immediately if NO barcodes were generated
  if (p_barcodes is null or array_length(p_barcodes, 1) = 0) then
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'inward_id', v_inward_id,
    'ledger_id', case when v_ledger is not null then v_ledger.id else null end,
    'balance_after', case when v_ledger is not null then v_ledger.balance_after 
                     else coalesce((select qty_on_hand from public.stock_balances 
                                     where office_id = v_office_id 
                                       and product_id = p_product_id 
                                       and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_resolved_batch_id, '00000000-0000-0000-0000-000000000000'::uuid)), 0)
                     end,
    'replayed', false
  );
end;
$$;


-- 2. Redefine save_outward to skip posting to ledger for batch dispatches
create or replace function public.save_outward(
  p_client_txn_id   uuid,
  p_product_id      uuid,
  p_qty             integer,
  p_outward_type    outward_type,
  p_party_name      text default null,
  p_contact_person  text default null,
  p_mobile          text default null,
  p_party_gst       text default null,
  p_party_address   text default null,
  p_invoice_no      text default null,
  p_sales_order_no  text default null,
  p_handed_over_by  text default null,
  p_received_by     text default null,
  p_notes           text default null,
  p_delivery_method text default null,
  p_batch_id        uuid default null,
  p_batches         jsonb default null
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id   uuid;
  v_outward_id  uuid;
  v_outward_no  text;
  v_ledger      public.stock_ledger;
  v_batch_item  jsonb;
  v_item_batch_id uuid;
  v_item_qty    integer;
  v_total_qty   integer := 0;
  v_customer_id uuid;
  v_contact     text;
  v_mobile      text;
  v_gst         text;
  v_address     text;
begin
  if (p_batches is not null and jsonb_array_length(p_batches) > 0) then
    for v_batch_item in select * from jsonb_array_elements(p_batches) loop
      v_total_qty := v_total_qty + (v_batch_item->>'qty')::integer;
    end loop;
  else
    v_total_qty := p_qty;
  end if;

  if (v_total_qty <= 0) then raise exception 'QTY_MUST_BE_POSITIVE'; end if;
  if (p_outward_type = 'SALE' and trim(p_party_name) = '') then
    raise exception 'PARTY_REQUIRED';
  end if;

  v_office_id := app.current_office_id();
  if (v_office_id is null) then raise exception 'NOT_IN_OFFICE'; end if;

  -- 1. Check ledger replay
  if app.replay_if_seen(p_client_txn_id) then
    return app.replay_result(p_client_txn_id);
  end if;

  -- 2. Check outwards replay (for barcoded outwards that didn't write to ledger)
  select id into v_outward_id from public.outwards where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object(
      'ok', true,
      'outward_id', v_outward_id,
      'ledger_id', null,
      'balance_after', coalesce((select qty_on_hand from public.stock_balances 
                                  where office_id = v_office_id 
                                    and product_id = p_product_id 
                                    and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_batch_id, '00000000-0000-0000-0000-000000000000'::uuid)), 0),
      'replayed', true
    );
  end if;

  v_outward_no := app.next_doc_no('OUT', 'app.outward_no_seq');
  v_contact := nullif(trim(p_contact_person), '');
  v_mobile := nullif(trim(p_mobile), '');
  v_gst := nullif(upper(trim(p_party_gst)), '');
  v_address := nullif(trim(p_party_address), '');

  if p_party_name is not null and length(trim(p_party_name)) > 0 then
    select id into v_customer_id
      from public.customers
     where lower(name) = lower(trim(p_party_name)) and deleted_at is null;

    if not found then
      insert into public.customers (name, contact_person, mobile, gst_no, address)
      values (trim(p_party_name), v_contact, v_mobile, v_gst, v_address)
      returning id into v_customer_id;
    else
      update public.customers
         set contact_person = coalesce(contact_person, v_contact),
             mobile         = coalesce(mobile, v_mobile),
             gst_no         = coalesce(gst_no, v_gst),
             address        = coalesce(address, v_address)
       where id = v_customer_id
         and ((contact_person is null and v_contact is not null)
           or (mobile is null and v_mobile is not null)
           or (gst_no is null and v_gst is not null)
           or (address is null and v_address is not null));
    end if;
  end if;

  insert into public.outwards (
    client_txn_id, office_id, outward_no, customer_id, outward_type, invoice_no,
    sales_order_no, handed_over_by, received_by, notes, delivery_method
  ) values (
    p_client_txn_id, v_office_id, v_outward_no, v_customer_id, p_outward_type, trim(p_invoice_no),
    trim(p_sales_order_no), trim(p_handed_over_by), trim(p_received_by), trim(p_notes), trim(p_delivery_method)
  ) returning id into v_outward_id;

  if (p_batches is not null and jsonb_array_length(p_batches) > 0) then
    for v_batch_item in select * from jsonb_array_elements(p_batches) loop
      v_item_batch_id := (v_batch_item->>'batch_id')::uuid;
      v_item_qty := (v_batch_item->>'qty')::integer;
      
      if (v_item_batch_id = '00000000-0000-0000-0000-000000000000'::uuid) then
        v_item_batch_id := null;
      end if;

      if (v_item_qty > 0) then
        insert into public.outward_items (outward_id, product_id, quantity, batch_id)
        values (v_outward_id, p_product_id, v_item_qty, v_item_batch_id);

        -- Skip ledger write for batch dispatches (requires scan to issue)
        if (v_item_batch_id is null) then
          v_ledger := app.post_ledger(
            p_client_txn_id := public.uuid_generate_v5_compat(p_client_txn_id, coalesce(v_item_batch_id::text, 'generic')),
            p_office_id     := v_office_id,
            p_product_id    := p_product_id,
            p_unit_id       := null,
            p_txn_type      := 'OUTWARD',
            p_qty_delta     := -v_item_qty,
            p_ref_type      := 'OUTWARD',
            p_ref_id        := v_outward_id,
            p_notes         := trim(p_notes),
            p_batch_id      := v_item_batch_id
          );
        end if;
      end if;
    end loop;
  else
    insert into public.outward_items (outward_id, product_id, quantity, batch_id)
    values (v_outward_id, p_product_id, p_qty, p_batch_id);

    -- Skip ledger write if batch_id is provided
    if (p_batch_id is null) then
      v_ledger := app.post_ledger(
        p_client_txn_id := p_client_txn_id,
        p_office_id     := v_office_id,
        p_product_id    := p_product_id,
        p_unit_id       := null,
        p_txn_type      := 'OUTWARD',
        p_qty_delta     := -p_qty,
        p_ref_type      := 'OUTWARD',
        p_ref_id        := v_outward_id,
        p_notes         := trim(p_notes),
        p_computer_name := null,
        p_batch_id      := p_batch_id
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'outward_id', v_outward_id,
    'ledger_id', case when v_ledger is not null then v_ledger.id else null end,
    'balance_after', case when v_ledger is not null then v_ledger.balance_after 
                     else coalesce((select qty_on_hand from public.stock_balances 
                                     where office_id = v_office_id 
                                       and product_id = p_product_id 
                                       and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_batch_id, '00000000-0000-0000-0000-000000000000'::uuid)), 0)
                     end,
    'replayed', false
  );
end;
$$;


-- 3. Drop trigger and function to flip barcodes automatically on save_outward
drop trigger if exists tg_outward_items_flip_barcodes on public.outward_items cascade;
drop function if exists app.tg_outward_items_flip_barcodes() cascade;


-- 4. Redefine scan_receive to support both inward scan (RECEIVE) and outward scan (ISSUE)
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

  -- Post to stock ledger
  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := v_bc.product_id,
    p_unit_id       := null,
    p_txn_type      := v_txn_type,
    p_qty_delta     := v_qty_delta,
    p_ref_type      := v_txn_type,
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


-- 5. Redefine v_stock_balances_by_batch view using barcode status counts (returning bigint for qty_on_hand)
create or replace view public.v_stock_balances_by_batch as
with barcoded_balances as (
  select 
    (
      select office_id from public.barcode_scans s 
       where s.barcode_id = pb.id 
       order by s.scanned_at desc limit 1
    ) as office_id,
    pb.product_id,
    pb.batch_id,
    count(*)::bigint as qty_on_hand
  from public.product_barcodes pb
  where pb.status in ('IN_STOCK', 'INWARDED')
  group by 1, pb.product_id, pb.batch_id
),
ledger_balances as (
  select 
    l.office_id,
    l.product_id,
    l.batch_id,
    sum(l.qty_delta)::bigint as qty_on_hand
  from public.stock_ledger l
  where not exists (
    select 1 from public.product_barcodes pb 
     where pb.product_id = l.product_id
  )
  group by l.office_id, l.product_id, l.batch_id
)
select office_id, product_id, batch_id, qty_on_hand from barcoded_balances where office_id is not null
union all
select office_id, product_id, batch_id, qty_on_hand from ledger_balances;


-- 6. Redefine rebuild_stock_balances() function
create or replace function app.rebuild_stock_balances() returns integer
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_rows integer;
begin
  create temp table _reserved on commit drop as
    select office_id, product_id, batch_id, qty_reserved, damaged_quantity from public.stock_balances;

  delete from public.stock_balances;

  insert into public.stock_balances (office_id, product_id, batch_id, qty_on_hand, qty_reserved, damaged_quantity, updated_at)
  select
    coalesce(src.office_id, r.office_id),
    coalesce(src.product_id, r.product_id),
    coalesce(src.batch_id, r.batch_id),
    coalesce(src.qty_on_hand, 0)::integer,
    coalesce(r.qty_reserved, 0),
    coalesce(r.damaged_quantity, 0),
    now()
  from (
    select office_id, product_id, batch_id, qty_on_hand from public.v_stock_balances_by_batch
  ) src
  full outer join _reserved r
    on r.office_id = src.office_id 
   and r.product_id = src.product_id 
   and r.batch_id is not distinct from src.batch_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

notify pgrst, 'reload schema';
