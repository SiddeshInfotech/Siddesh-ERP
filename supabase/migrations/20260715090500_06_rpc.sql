-- =============================================================================
-- 06 — RPC FUNCTIONS  (the entire "backend")
--
-- Clients NEVER write to stock_ledger / stock_balances directly -- RLS denies it
-- (see 07_rls.sql). All writes go through these SECURITY DEFINER functions, so
-- validation, locking and audit stamping cannot be bypassed by a crafted request
-- from a decompiled .exe or APK.
--
-- Contract for the app team: docs/sprint-1/CONTRACT.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal: post one ledger row + move the balance cache. ATOMIC.
--
-- SELECT ... FOR UPDATE is the load-bearing line. Two offices scanning the last
-- unit at the same instant will serialise here; without it both read "1
-- available", both pass validation, and stock goes negative.
-- -----------------------------------------------------------------------------
create or replace function app.post_ledger(
  p_client_txn_id uuid,
  p_office_id     uuid,
  p_product_id    uuid,
  p_unit_id       uuid,
  p_txn_type      stock_txn_type,
  p_qty_delta     integer,
  p_ref_type      doc_ref_type,
  p_ref_id        uuid,
  p_notes         text default null,
  p_computer_name text default null
) returns public.stock_ledger
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_balance integer;
  v_new     integer;
  v_row     public.stock_ledger;
begin
  -- Lock (or create) the balance row for this office+product.
  select qty_on_hand into v_balance
    from public.stock_balances
   where office_id = p_office_id and product_id = p_product_id
     for update;

  if not found then
    insert into public.stock_balances (office_id, product_id, qty_on_hand)
    values (p_office_id, p_product_id, 0)
    on conflict (office_id, product_id) do nothing;

    -- Re-select with the lock: another transaction may have inserted it first.
    select qty_on_hand into v_balance
      from public.stock_balances
     where office_id = p_office_id and product_id = p_product_id
       for update;
  end if;

  v_new := v_balance + p_qty_delta;

  if v_new < 0 then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %', v_balance, abs(p_qty_delta)
      using errcode = 'P0001';
  end if;

  insert into public.stock_ledger (
    office_id, product_id, product_unit_id, txn_type, qty_delta, balance_after,
    ref_type, ref_id, client_txn_id, notes, computer_name, created_by
  ) values (
    p_office_id, p_product_id, p_unit_id, p_txn_type, p_qty_delta, v_new,
    p_ref_type, p_ref_id, p_client_txn_id, p_notes, p_computer_name, auth.uid()
  ) returning * into v_row;

  update public.stock_balances
     set qty_on_hand = v_new, updated_at = now()
   where office_id = p_office_id and product_id = p_product_id;

  return v_row;
end;
$$;


-- -----------------------------------------------------------------------------
-- Internal: idempotency check.
-- If this client_txn_id already produced a ledger row, return it instead of
-- writing a second one. See CONTRACT.md "Idempotency".
-- -----------------------------------------------------------------------------
create or replace function app.replay_if_seen(p_client_txn_id uuid)
returns json
  language plpgsql security definer set search_path = public, app as
$$
declare v_row public.stock_ledger;
begin
  select * into v_row from public.stock_ledger where client_txn_id = p_client_txn_id;
  if found then
    return json_build_object(
      'ok', true,
      'ledger_id', v_row.id,
      'balance_after', v_row.balance_after,
      'replayed', true
    );
  end if;
  return null;
end;
$$;


-- =============================================================================
-- scan_lookup(p_code)   — SRD §8, §13
--
-- Called on every barcode scan, from both the phone camera and the USB scanner.
-- Resolution order matters: manufacturer barcodes (Option B) are checked before
-- our own SKUs so a vendor EAN never gets shadowed.
--
-- Returns found:false for an unknown code -- that is a SUCCESSFUL response, not
-- an error (SRD §13: "Barcode not found. Create New Product?").
-- =============================================================================
create or replace function public.scan_lookup(p_code text)
returns json
  language plpgsql stable security definer set search_path = public, app as
$$
declare
  v_office_id  uuid := app.current_office_id();
  v_product    public.products;
  v_unit       public.product_units;
  v_qty        integer := 0;
  v_reserved   integer := 0;
begin
  if v_office_id is null and not app.is_admin() then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  p_code := trim(p_code);
  if p_code is null or length(p_code) = 0 then
    return json_build_object('found', false, 'match_type', 'UNKNOWN', 'product', null, 'stock', null);
  end if;

  -- 1) Manufacturer / alias barcodes, and our own primary SKU (seeded here too)
  select p.* into v_product
    from public.product_barcodes b
    join public.products p on p.id = b.product_id
   where b.code = p_code and p.deleted_at is null
   limit 1;

  -- 2) Serial unit barcode (SRD §18B)
  if not found then
    select u.* into v_unit
      from public.product_units u
     where u.unit_barcode = p_code and u.deleted_at is null
     limit 1;

    if found then
      select p.* into v_product from public.products p where p.id = v_unit.product_id;
    end if;
  end if;

  -- 3) Fallback: direct SKU match (defensive -- the seed trigger should cover it)
  if v_product.id is null then
    select p.* into v_product
      from public.products p
     where p.sku_barcode = p_code and p.deleted_at is null
     limit 1;
  end if;

  if v_product.id is null then
    return json_build_object('found', false, 'match_type', 'UNKNOWN', 'product', null, 'stock', null);
  end if;

  -- Stock is per-office. A Store Manager / Sales Executive has an office, so read that
  -- one row. An ADMIN has office_id = null (they're global), so summing
  -- across offices is the only sensible answer -- `office_id = coalesce(x,
  -- office_id)` would silently return whichever office sorted first, which reads
  -- as a plausible number and is wrong.
  if v_office_id is null then
    select coalesce(sum(qty_on_hand), 0), coalesce(sum(qty_reserved), 0)
      into v_qty, v_reserved
      from public.stock_balances
     where product_id = v_product.id;
  else
    select coalesce(qty_on_hand, 0), coalesce(qty_reserved, 0)
      into v_qty, v_reserved
      from public.stock_balances
     where product_id = v_product.id and office_id = v_office_id;
  end if;

  return json_build_object(
    'found', true,
    'match_type', case when v_unit.id is not null then 'UNIT' else 'PRODUCT' end,
    'product', json_build_object(
      'id',            v_product.id,
      'name',          v_product.name,
      'category',      (select name from public.categories where id = v_product.category_id),
      'brand',         (select name from public.brands     where id = v_product.brand_id),
      'model',         v_product.model_number,
      'unit',          (select code from public.uoms       where id = v_product.uom_id),
      'sku_barcode',   v_product.sku_barcode,
      'tracking_mode', v_product.tracking_mode,
      'is_kit',        v_product.is_kit
    ),
    'unit', case when v_unit.id is null then null else json_build_object(
      'id',           v_unit.id,
      'serial_no',    v_unit.serial_no,
      'unit_barcode', v_unit.unit_barcode,
      'status',       v_unit.status
    ) end,
    'stock', json_build_object(
      'office_id',     v_office_id,
      'qty_on_hand',   coalesce(v_qty, 0),
      'qty_available', coalesce(v_qty, 0) - coalesce(v_reserved, 0)
    )
  );
end;
$$;


-- =============================================================================
-- save_inward(...)   — SRD §5
-- Creates supplier (find-or-create), inward header + item, posts ledger.
-- All-or-nothing: a function body is one transaction.
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
  p_computer_name   text default null
) returns json
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_replay      json;
  v_office_id   uuid := app.current_office_id();
  v_supplier_id uuid;
  v_inward_id   uuid;
  v_ledger      public.stock_ledger;
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

  -- Find-or-create supplier (SRD §5 step 4)
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
--
-- Handles the kit case: selling 1 AI Lab Kit posts one ledger row per component,
-- all sharing ref_id, all in one transaction. Either every component is deducted
-- or none is -- there is no half-sold kit.
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
  p_computer_name   text default null
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

  -- Find-or-create customer / school (SRD §6 step 5)
  if p_party_name is not null and length(trim(p_party_name)) > 0 then
    select id into v_customer_id
      from public.customers
     where lower(name) = lower(trim(p_party_name)) and deleted_at is null;

    if not found then
      insert into public.customers (name, contact_person, mobile)
      values (trim(p_party_name), p_contact_person, p_mobile)
      returning id into v_customer_id;
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
-- TRANSFERS — two-phase (client chat §8/§9)
-- =============================================================================

create or replace function public.transfer_dispatch(
  p_client_txn_id uuid,
  p_to_office_id  uuid,
  p_product_id    uuid,
  p_qty           integer,
  p_courier_name  text default null,
  p_docket_no     text default null,
  p_notes         text default null
) returns json
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_replay     json;
  v_from       uuid := app.current_office_id();
  v_transfer_id uuid;
  v_ledger     public.stock_ledger;
begin
  v_replay := app.replay_if_seen(p_client_txn_id);
  if v_replay is not null then return v_replay; end if;

  if v_from is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;
  if v_from = p_to_office_id then
    raise exception 'INVALID_TRANSFER: source and destination office are the same' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'INVALID_QTY: quantity must be greater than 0' using errcode = 'P0001';
  end if;

  insert into public.transfers (
    transfer_no, from_office_id, to_office_id, status,
    dispatched_at, dispatched_by, courier_name, docket_no, notes
  ) values (
    app.next_doc_no('TRF', 'app.transfer_no_seq'), v_from, p_to_office_id, 'DISPATCHED',
    now(), auth.uid(), p_courier_name, p_docket_no, p_notes
  ) returning id into v_transfer_id;

  insert into public.transfer_items (transfer_id, product_id, quantity)
  values (v_transfer_id, p_product_id, p_qty);

  -- Debit source only. Destination is credited on receipt -- stock is
  -- deliberately "in transit" and visible as such until then.
  v_ledger := app.post_ledger(
    p_client_txn_id, v_from, p_product_id, null,
    'TRANSFER_OUT', -p_qty, 'TRANSFER', v_transfer_id, p_notes, null
  );

  return json_build_object(
    'ok', true, 'transfer_id', v_transfer_id,
    'ledger_id', v_ledger.id, 'balance_after', v_ledger.balance_after, 'replayed', false
  );
end;
$$;


create or replace function public.transfer_receive(
  p_client_txn_id uuid,
  p_transfer_id   uuid,
  p_notes         text default null
) returns json
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_replay json;
  v_office uuid := app.current_office_id();
  v_trf    public.transfers;
  v_item   record;
  v_ledger public.stock_ledger;
  v_txn    uuid;
begin
  v_replay := app.replay_if_seen(p_client_txn_id);
  if v_replay is not null then return v_replay; end if;

  select * into v_trf from public.transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'TRANSFER_NOT_FOUND: %', p_transfer_id using errcode = 'P0001';
  end if;
  if v_trf.to_office_id <> v_office then
    raise exception 'WRONG_OFFICE: this transfer is addressed to another office' using errcode = 'P0001';
  end if;
  if v_trf.status <> 'DISPATCHED' then
    raise exception 'INVALID_STATUS: transfer is %, expected DISPATCHED', v_trf.status using errcode = 'P0001';
  end if;

  for v_item in select product_id, quantity from public.transfer_items where transfer_id = p_transfer_id loop
    v_txn := uuid_generate_v5_compat(p_client_txn_id, v_item.product_id::text);
    v_ledger := app.post_ledger(
      v_txn, v_office, v_item.product_id, null,
      'TRANSFER_IN', v_item.quantity, 'TRANSFER', p_transfer_id, p_notes, null
    );
  end loop;

  update public.transfers
     set status = 'RECEIVED', received_at = now(), received_by = auth.uid()
   where id = p_transfer_id;

  return json_build_object('ok', true, 'transfer_id', p_transfer_id, 'replayed', false);
end;
$$;


-- =============================================================================
-- stock_adjust  — the ONLY sanctioned way to correct a mistake (SRD §16)
-- Never UPDATE a ledger row. Post an opposing entry with a reason.
-- =============================================================================
create or replace function public.stock_adjust(
  p_client_txn_id uuid,
  p_product_id    uuid,
  p_qty_delta     integer,
  p_reason        text
) returns json
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_replay json;
  v_office uuid := app.current_office_id();
  v_ledger public.stock_ledger;
begin
  v_replay := app.replay_if_seen(p_client_txn_id);
  if v_replay is not null then return v_replay; end if;

  if app.current_role() = 'SALES_EXECUTIVE' then
    raise exception 'FORBIDDEN: only Store Manager or Admin may adjust stock' using errcode = 'P0001';
  end if;
  if p_qty_delta = 0 then
    raise exception 'INVALID_QTY: adjustment cannot be zero' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'REASON_REQUIRED: adjustments must state a reason' using errcode = 'P0001';
  end if;

  v_ledger := app.post_ledger(
    p_client_txn_id, v_office, p_product_id, null,
    'ADJUSTMENT', p_qty_delta, 'ADJUSTMENT', null, p_reason, null
  );

  insert into public.activity_logs (actor_id, office_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), v_office, 'STOCK_ADJUSTED', 'stock_ledger', v_ledger.id,
          json_build_object('delta', p_qty_delta, 'reason', p_reason)::jsonb);

  return json_build_object('ok', true, 'ledger_id', v_ledger.id, 'balance_after', v_ledger.balance_after, 'replayed', false);
end;
$$;


-- -----------------------------------------------------------------------------
-- Deterministic UUID from (namespace, name). Used to derive stable per-component
-- txn ids from a parent client_txn_id so kit/transfer retries replay instead of
-- double-posting. Plain md5 -> uuid; no extension dependency.
-- -----------------------------------------------------------------------------
create or replace function public.uuid_generate_v5_compat(p_namespace uuid, p_name text)
returns uuid
  language sql immutable as
$$ select md5(p_namespace::text || ':' || p_name)::uuid $$;


-- =============================================================================
-- GRANTS — least privilege (principles §14)
-- =============================================================================

-- app.post_ledger writes stock directly with no validation of WHO is asking --
-- it trusts its caller. Only the public RPCs above may call it. Postgres grants
-- EXECUTE to PUBLIC by default on every new function, so this revoke matters:
-- without it, `authenticated` holds USAGE on schema app (needed by RLS) and
-- could forge arbitrary ledger rows.
--
-- PostgREST does not expose schema `app`, so this is defence in depth rather
-- than the only lock -- which is exactly how it should be.
revoke execute on all functions in schema app from public, anon, authenticated;

-- Re-grant ONLY the four read-only identity helpers that RLS policies need.
grant execute on function app.current_office_id()     to authenticated;
grant execute on function app.current_role()          to authenticated;
grant execute on function app.is_admin()        to authenticated;
grant execute on function app.can_access_office(uuid) to authenticated;

-- --- Expose only what clients may call --------------------------------------
revoke all on function public.scan_lookup(text)        from public, anon;
revoke all on function public.save_inward              from public, anon;
revoke all on function public.save_outward             from public, anon;
revoke all on function public.transfer_dispatch        from public, anon;
revoke all on function public.transfer_receive         from public, anon;
revoke all on function public.stock_adjust             from public, anon;

grant execute on function public.scan_lookup(text)     to authenticated;
grant execute on function public.save_inward           to authenticated;
grant execute on function public.save_outward          to authenticated;
grant execute on function public.transfer_dispatch     to authenticated;
grant execute on function public.transfer_receive      to authenticated;
grant execute on function public.stock_adjust          to authenticated;
