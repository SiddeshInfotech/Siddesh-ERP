-- =============================================================================
-- 10 — ATTACHMENTS  (SRD §5 step 6 invoice upload, §6 step 8 signature/photo)
--
-- inwards.invoice_file_path and outwards.signature_path have existed since 04,
-- but there was no bucket to put a file in and no RPC parameter to carry the
-- path. Both are added here. Document/Contract.md amended first.
--
-- THE BUCKETS ARE PRIVATE. This is the whole security decision.
-- A public bucket serves every object to anyone with the URL, forever, with no
-- auth — and these objects are supplier invoices carrying GST numbers, order
-- values and customer names, plus delivery signatures. "Unguessable URL" is not
-- access control. Private + RLS means a request without a valid JWT gets nothing,
-- and clients must mint a short-lived signed URL to read one.
-- =============================================================================

-- 10 MB: a phone photo of an invoice is ~2-5 MB, a scanned PDF less. The limit is
-- enforced by Storage itself, so a client cannot talk its way past it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('invoices', 'invoices', false, 10485760,
   array['application/pdf','image/jpeg','image/png','image/webp']),
  ('proofs', 'proofs', false, 10485760,
   array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- RLS on storage.objects.
--
-- Every object is stored under its office's id: `<office_id>/<uuid>.<ext>`. The
-- first path segment IS the tenant boundary, so the policies compare against it.
-- Text comparison rather than a ::uuid cast on purpose — a cast on an arbitrary
-- object name raises 22P02 instead of simply denying, turning a policy into a
-- crash.
--
-- ADMIN reads across offices (they run the HQ dashboard) but still writes into a
-- real office folder — app.current_office_id() is null for a global admin, and
-- save_inward already refuses those with NO_OFFICE, so the two agree.
-- -----------------------------------------------------------------------------

drop policy if exists attachments_select on storage.objects;
drop policy if exists attachments_insert on storage.objects;

create policy attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('invoices', 'proofs')
    and (
      app.is_admin()
      or (storage.foldername(name))[1] = app.current_office_id()::text
    )
  );

create policy attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('invoices', 'proofs')
    and (storage.foldername(name))[1] = app.current_office_id()::text
  );

-- NO update or delete policy, deliberately.
--
-- An attached invoice and a delivery signature are evidence: SRD §14 wants a
-- complete audit trail, and a proof-of-delivery that the person who made the
-- delivery can quietly replace is not proof of anything. Postgres denies by
-- default once RLS is on, so the absence of a policy IS the denial — the same
-- mechanism that protects stock_ledger. Attaching the wrong file is corrected by
-- uploading a new one, which leaves both.


-- =============================================================================
-- RPCs — carry the uploaded path onto the document.
--
-- Adding a parameter changes the signature, and Postgres treats that as a NEW
-- function rather than a replacement, so the old overload must be dropped or
-- every defaulted call becomes ambiguous. A DROP also takes the grants with it;
-- they are re-issued at the bottom. Both new params are optional and trailing,
-- so existing callers are unaffected.
-- =============================================================================

drop function if exists public.save_inward(uuid, uuid, integer, text, text, text, date, text, text, text, text, text);
drop function if exists public.save_outward(uuid, uuid, integer, outward_type, text, text, text, text, text, text, text, text, text, text, text);


create or replace function public.save_inward(
  p_client_txn_id     uuid,
  p_product_id        uuid,
  p_qty               integer,
  p_supplier_name     text,
  p_supplier_mobile   text default null,
  p_invoice_no        text default null,
  p_invoice_date      date default null,
  p_purchase_order    text default null,
  p_brought_by        text default null,
  p_notes             text default null,
  p_computer_name     text default null,
  p_supplier_gst      text default null,
  p_invoice_file_path text default null   -- NEW (SRD §5 step 6)
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

  -- An attachment must belong to THIS office. The Storage policy already enforces
  -- that on write, but the path arrives here as a plain string from the client and
  -- nothing stops a crafted request from pointing a document at another office's
  -- file. Cheap to check; the alternative is a slow leak across offices.
  if p_invoice_file_path is not null
     and split_part(p_invoice_file_path, '/', 1) <> v_office_id::text then
    raise exception 'INVALID_ATTACHMENT: file does not belong to this office' using errcode = 'P0001';
  end if;

  if p_supplier_name is not null and length(trim(p_supplier_name)) > 0 then
    select id into v_supplier_id
      from public.suppliers
     where lower(name) = lower(trim(p_supplier_name)) and deleted_at is null;

    if not found then
      insert into public.suppliers (name, mobile, gst_no)
      values (trim(p_supplier_name), v_mobile, v_gst)
      returning id into v_supplier_id;
    else
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
    purchase_order_no, brought_by, notes, invoice_file_path
  ) values (
    app.next_doc_no('IN', 'app.inward_no_seq'), v_office_id, v_supplier_id,
    p_invoice_no, p_invoice_date, p_purchase_order, p_brought_by, p_notes,
    nullif(trim(p_invoice_file_path), '')
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
    'ok', true, 'ledger_id', v_ledger.id, 'inward_id', v_inward_id,
    'balance_after', v_ledger.balance_after, 'replayed', false
  );
end;
$$;


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
  p_party_gst       text default null,
  p_party_address   text default null,
  p_signature_path  text default null    -- NEW (SRD §6 step 8)
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

  if p_signature_path is not null
     and split_part(p_signature_path, '/', 1) <> v_office_id::text then
    raise exception 'INVALID_ATTACHMENT: file does not belong to this office' using errcode = 'P0001';
  end if;

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
    sales_order_no, handed_over_by, received_by, notes, signature_path
  ) values (
    app.next_doc_no('OUT', 'app.outward_no_seq'), v_office_id, v_customer_id, p_outward_type,
    p_invoice_no, p_sales_order_no, p_handed_over_by, p_received_by, p_notes,
    nullif(trim(p_signature_path), '')
  ) returning id into v_outward_id;

  insert into public.outward_items (outward_id, product_id, quantity)
  values (v_outward_id, p_product_id, p_qty);

  if v_is_kit then
    for v_comp in
      select component_product_id, quantity from public.kit_components where kit_product_id = p_product_id
    loop
      v_comp_txn := uuid_generate_v5_compat(p_client_txn_id, v_comp.component_product_id::text);
      v_ledger := app.post_ledger(
        v_comp_txn, v_office_id, v_comp.component_product_id, null,
        'OUTWARD', -(v_comp.quantity * p_qty), 'OUTWARD', v_outward_id,
        coalesce(p_notes, '') || ' [kit component]', p_computer_name
      );
    end loop;

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
    'ok', true, 'ledger_id', v_ledger.id, 'outward_id', v_outward_id,
    'balance_after', v_ledger.balance_after, 'replayed', false
  );
end;
$$;


-- =============================================================================
-- GRANTS — a DROP takes them with it. Without these, no stock moves at all.
-- =============================================================================
revoke all on function public.save_inward  from public, anon;
revoke all on function public.save_outward from public, anon;

grant execute on function public.save_inward  to authenticated;
grant execute on function public.save_outward to authenticated;
grant execute on function public.save_inward  to service_role;
grant execute on function public.save_outward to service_role;

notify pgrst, 'reload schema';
