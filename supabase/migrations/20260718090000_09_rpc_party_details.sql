-- =============================================================================
-- 09 — SUPPLIER / PARTY DETAILS ON THE SAVE RPCs  (SRD §5 step 4, §6 step 5)
--
-- WHY
-- SRD §5 requires a supplier GST number; §6 requires a party GST number and
-- address. `suppliers.gst_no`, `customers.gst_no` and `customers.address` have
-- existed since 04_transactions.sql, but no RPC accepted them — so the desktop
-- forms had nowhere to put those three fields and the SRD could not be met.
-- Document/Contract.md was amended first (18/07/2026), per the rule book.
--
-- WHY DROP AND RECREATE RATHER THAN `create or replace`
-- Adding a parameter changes the signature, and Postgres treats a different
-- signature as a NEW function rather than a replacement. The old 11-argument
-- save_inward would survive alongside the new 12-argument one, and every call
-- that relies on defaults would then fail as ambiguous. Dropping is the only way
-- to actually replace it. Grants do not survive a drop, so they are re-issued at
-- the bottom of this file — without them, every client gets "permission denied
-- for function save_inward".
--
-- COMPATIBILITY
-- Every new parameter is optional and trailing, so existing callers are
-- unaffected: they simply pass NULL and behave exactly as before.
-- =============================================================================

drop function if exists public.save_inward(uuid, uuid, integer, text, text, text, date, text, text, text, text);
drop function if exists public.save_outward(uuid, uuid, integer, outward_type, text, text, text, text, text, text, text, text, text);


-- =============================================================================
-- save_inward(...)   — SRD §5
-- =============================================================================
create or replace function public.save_inward(
  p_client_txn_id   uuid,
  p_product_id      uuid,
  p_qty             integer,
  p_supplier_name   text,
  p_supplier_mobile text default null,
  p_invoice_no      text default null,
  p_invoice_date    date default null,
  p_purchase_order  text default null,
  p_brought_by      text default null,
  p_notes           text default null,
  p_computer_name   text default null,
  p_supplier_gst    text default null   -- NEW (SRD §5)
) returns json
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_replay      json;
  v_office_id   uuid := app.current_office_id();
  v_supplier_id uuid;
  v_inward_id   uuid;
  v_ledger      public.stock_ledger;
  v_mobile      text := nullif(trim(p_supplier_mobile), '');
  v_gst         text := nullif(upper(trim(p_supplier_gst)), '');
begin
  v_replay := app.replay_if_seen(p_client_txn_id);
  if v_replay is not null then return v_replay; end if;

  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'INVALID_QTY: quantity must be greater than 0' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and deleted_at is null) then
    raise exception 'PRODUCT_NOT_FOUND: %', p_product_id using errcode = 'P0001';
  end if;

  -- Find-or-create supplier (SRD §5 step 4).
  --
  -- The empty string is normalised to NULL above, and that is load-bearing:
  -- chk_suppliers_mobile is `mobile is null or mobile ~ '^[0-9]{10}$'`, so an ''
  -- from an untouched form input is neither null nor ten digits. It would abort
  -- the whole transaction and the stock would never be received — a blank
  -- optional field failing a receipt.
  if p_supplier_name is not null and length(trim(p_supplier_name)) > 0 then
    select id into v_supplier_id
      from public.suppliers
     where lower(name) = lower(trim(p_supplier_name)) and deleted_at is null;

    if not found then
      insert into public.suppliers (name, mobile, gst_no)
      values (trim(p_supplier_name), v_mobile, v_gst)
      returning id into v_supplier_id;
    else
      -- Fill blanks only. A typo in today's inward must never overwrite a GST
      -- number already on file; correcting party details is an edit of that
      -- record, not a side effect of receiving stock. The guard also avoids a
      -- pointless UPDATE (and version bump) on every single inward.
      update public.suppliers
         set mobile = coalesce(mobile, v_mobile),
             gst_no = coalesce(gst_no, v_gst)
       where id = v_supplier_id
         and ((mobile is null and v_mobile is not null)
           or (gst_no is null and v_gst is not null));
    end if;
  end if;

  insert into public.inwards (
    inward_no, office_id, supplier_id, invoice_no, invoice_date,
    purchase_order_no, brought_by, notes
  ) values (
    app.next_doc_no('IN', 'app.inward_no_seq'), v_office_id, v_supplier_id,
    p_invoice_no, p_invoice_date, p_purchase_order, p_brought_by, p_notes
  ) returning id into v_inward_id;

  insert into public.inward_items (inward_id, product_id, quantity)
  values (v_inward_id, p_product_id, p_qty);

  v_ledger := app.post_ledger(
    p_client_txn_id, v_office_id, p_product_id, null,
    'INWARD', p_qty, 'INWARD', v_inward_id, p_notes, p_computer_name
  );

  insert into public.activity_logs (actor_id, office_id, action, entity_type, entity_id, after_data, computer_name)
  values (auth.uid(), v_office_id, 'INWARD_SAVED', 'inwards', v_inward_id,
          json_build_object('product_id', p_product_id, 'qty', p_qty)::jsonb, p_computer_name);

  return json_build_object(
    'ok', true,
    'ledger_id', v_ledger.id,
    'inward_id', v_inward_id,
    'balance_after', v_ledger.balance_after,
    'replayed', false
  );
end;
$$;


-- =============================================================================
-- save_outward(...)   — SRD §6, §18A
-- =============================================================================
create or replace function public.save_outward(
  p_client_txn_id   uuid,
  p_product_id      uuid,
  p_qty             integer,
  p_outward_type    outward_type,
  p_party_name      text default null,
  p_contact_person  text default null,
  p_mobile          text default null,
  p_invoice_no      text default null,
  p_sales_order_no  text default null,
  p_handed_over_by  text default null,
  p_received_by     text default null,
  p_notes           text default null,
  p_computer_name   text default null,
  p_party_gst       text default null,  -- NEW (SRD §6)
  p_party_address   text default null   -- NEW (SRD §6)
) returns json
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_replay      json;
  v_office_id   uuid := app.current_office_id();
  v_customer_id uuid;
  v_outward_id  uuid;
  v_ledger      public.stock_ledger;
  v_is_kit      boolean;
  v_comp        record;
  v_comp_txn    uuid;
  v_contact     text := nullif(trim(p_contact_person), '');
  v_mobile      text := nullif(trim(p_mobile), '');
  v_gst         text := nullif(upper(trim(p_party_gst)), '');
  v_address     text := nullif(trim(p_party_address), '');
begin
  v_replay := app.replay_if_seen(p_client_txn_id);
  if v_replay is not null then return v_replay; end if;

  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'INVALID_QTY: quantity must be greater than 0' using errcode = 'P0001';
  end if;

  select is_kit into v_is_kit from public.products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND: %', p_product_id using errcode = 'P0001';
  end if;

  if p_outward_type = 'SALE' and (p_party_name is null or length(trim(p_party_name)) = 0) then
    raise exception 'PARTY_REQUIRED: a SALE must record the customer' using errcode = 'P0001';
  end if;

  -- Find-or-create customer / school (SRD §6 step 5). See save_inward for why the
  -- empty string is normalised to NULL and why existing values are never overwritten.
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
    outward_no, office_id, customer_id, outward_type, invoice_no,
    sales_order_no, handed_over_by, received_by, notes
  ) values (
    app.next_doc_no('OUT', 'app.outward_no_seq'), v_office_id, v_customer_id, p_outward_type,
    p_invoice_no, p_sales_order_no, p_handed_over_by, p_received_by, p_notes
  ) returning id into v_outward_id;

  insert into public.outward_items (outward_id, product_id, quantity)
  values (v_outward_id, p_product_id, p_qty);

  if v_is_kit then
    -- SRD §18A: deduct every component, not the kit itself.
    for v_comp in
      select component_product_id, quantity from public.kit_components where kit_product_id = p_product_id
    loop
      -- Derive a stable per-component txn id from the parent, so a retry of the
      -- whole submission replays identically instead of double-deducting.
      v_comp_txn := uuid_generate_v5_compat(p_client_txn_id, v_comp.component_product_id::text);

      v_ledger := app.post_ledger(
        v_comp_txn, v_office_id, v_comp.component_product_id, null,
        'OUTWARD', -(v_comp.quantity * p_qty), 'OUTWARD', v_outward_id,
        coalesce(p_notes, '') || ' [kit component]', p_computer_name
      );
    end loop;

    -- Anchor row so the parent client_txn_id is consumed and replay works.
    v_ledger := app.post_ledger(
      p_client_txn_id, v_office_id, p_product_id, null,
      'OUTWARD', -p_qty, 'OUTWARD', v_outward_id, p_notes, p_computer_name
    );
  else
    v_ledger := app.post_ledger(
      p_client_txn_id, v_office_id, p_product_id, null,
      'OUTWARD', -p_qty, 'OUTWARD', v_outward_id, p_notes, p_computer_name
    );
  end if;

  insert into public.activity_logs (actor_id, office_id, action, entity_type, entity_id, after_data, computer_name)
  values (auth.uid(), v_office_id, 'OUTWARD_SAVED', 'outwards', v_outward_id,
          json_build_object('product_id', p_product_id, 'qty', p_qty, 'type', p_outward_type)::jsonb, p_computer_name);

  return json_build_object(
    'ok', true,
    'ledger_id', v_ledger.id,
    'outward_id', v_outward_id,
    'balance_after', v_ledger.balance_after,
    'replayed', false
  );
end;
$$;


-- =============================================================================
-- GRANTS — a DROP takes the grants with it. Re-issue them, or every client gets
-- "permission denied for function save_inward" and no stock can move at all.
-- =============================================================================
revoke all on function public.save_inward  from public, anon;
revoke all on function public.save_outward from public, anon;

grant execute on function public.save_inward  to authenticated;
grant execute on function public.save_outward to authenticated;
grant execute on function public.save_inward  to service_role;
grant execute on function public.save_outward to service_role;

-- PostgREST caches the schema; without this the new parameters are rejected as
-- unknown until the connection pool happens to recycle.
notify pgrst, 'reload schema';
