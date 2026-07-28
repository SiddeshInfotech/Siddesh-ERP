-- Fix save_outward RPC to resolve customer_id from customers table instead of writing directly to non-existent columns in outwards.
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

  if app.replay_if_seen(p_client_txn_id) then
    return app.replay_result(p_client_txn_id);
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
        insert into public.outward_items (outward_id, product_id, qty, batch_id)
        values (v_outward_id, p_product_id, v_item_qty, v_item_batch_id);

        v_ledger := app.post_ledger(
          p_client_txn_id := p_client_txn_id,
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
    end loop;
  else
    insert into public.outward_items (outward_id, product_id, qty, batch_id)
    values (v_outward_id, p_product_id, p_qty, p_batch_id);

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
      p_batch_id      := p_batch_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'outward_id', v_outward_id,
    'ledger_id', v_ledger.id,
    'balance_after', v_ledger.balance_after,
    'replayed', false
  );
end;
$$;
