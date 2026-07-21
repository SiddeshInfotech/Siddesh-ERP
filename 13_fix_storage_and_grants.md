-- =============================================================================
-- ULTIMATE FIX: STORAGE BUCKETS, BATCHES & GRANTS
-- Run this entire file in your Supabase SQL Editor.
-- =============================================================================

-- 1. Create the storage buckets (from 10_attachments)
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

-- 2. Set up RLS for the buckets
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

-- 3. DROP ALL POSSIBLE CONFLICTING VERSIONS OF SAVE_INWARD & SAVE_OUTWARD
-- We drop by specific signatures so it works perfectly.

-- Drop the 10_attachments.sql versions
drop function if exists public.save_inward(uuid, uuid, integer, text, text, text, date, text, text, text, text, text, text) cascade;
drop function if exists public.save_outward(uuid, uuid, integer, outward_type, text, text, text, text, text, text, text, text, text, text, text, text) cascade;

-- Drop the 12_batches.sql versions
drop function if exists public.save_inward(uuid, uuid, integer, text, text, text, text, date, text, text, text, text, uuid, text, text[]) cascade;
drop function if exists public.save_outward(uuid, uuid, integer, outward_type, text, text, text, text, text, text, text, text, text, text, text, uuid) cascade;

-- Drop the original ones
drop function if exists public.save_inward(uuid, uuid, integer, text, text, text, date, text, text, text, text, text) cascade;
drop function if exists public.save_outward(uuid, uuid, integer, outward_type, text, text, text, text, text, text, text, text, text, text, text) cascade;


-- 4. RECREATE THE CORRECT BATCH-ENABLED FUNCTIONS
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
  v_inward_id   uuid;
  v_inward_no   text;
  v_ledger      public.stock_ledger;
  v_resolved_batch_id uuid;
  v_bc text;
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
    insert into public.product_batches (code, product_id)
    values (p_batch_code, p_product_id)
    on conflict (code) do update set updated_at = now()
    returning id into v_resolved_batch_id;
  end if;

  -- Insert barcodes for this batch
  if (p_barcodes is not null and array_length(p_barcodes, 1) > 0) then
    foreach v_bc in array p_barcodes loop
      insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary)
      values (p_product_id, v_bc, v_resolved_batch_id, 'CODE128', false)
      on conflict (code) do nothing;
    end loop;
  end if;

  v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');

  insert into public.inwards (
    client_txn_id, office_id, inward_no, supplier_name, supplier_mobile,
    supplier_gst, invoice_no, invoice_date, purchase_order_no, brought_by, 
    notes, invoice_file_path
  ) values (
    p_client_txn_id, v_office_id, v_inward_no, trim(p_supplier_name), trim(p_supplier_mobile),
    trim(p_supplier_gst), trim(p_invoice_no), p_invoice_date, trim(p_purchase_order), trim(p_brought_by), 
    trim(p_notes), trim(p_invoice_file_path)
  ) returning id into v_inward_id;

  insert into public.inward_items (inward_id, product_id, qty, batch_id)
  values (v_inward_id, p_product_id, p_qty, v_resolved_batch_id);

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
  p_batch_id        uuid default null
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id   uuid;
  v_outward_id  uuid;
  v_outward_no  text;
  v_ledger      public.stock_ledger;
begin
  if (p_qty <= 0) then raise exception 'QTY_MUST_BE_POSITIVE'; end if;
  if (p_outward_type = 'SALE' and trim(p_party_name) = '') then
    raise exception 'PARTY_REQUIRED';
  end if;

  v_office_id := app.current_office_id();
  if (v_office_id is null) then raise exception 'NOT_IN_OFFICE'; end if;

  if app.replay_if_seen(p_client_txn_id) then
    return app.replay_result(p_client_txn_id);
  end if;

  v_outward_no := app.next_doc_no('OUT', 'app.outward_no_seq');

  insert into public.outwards (
    client_txn_id, office_id, outward_no, outward_type, party_name,
    contact_person, mobile, party_gst, party_address, invoice_no,
    sales_order_no, handed_over_by, received_by, notes, delivery_method
  ) values (
    p_client_txn_id, v_office_id, v_outward_no, p_outward_type, trim(p_party_name),
    trim(p_contact_person), trim(p_mobile), trim(p_party_gst), trim(p_party_address), trim(p_invoice_no),
    trim(p_sales_order_no), trim(p_handed_over_by), trim(p_received_by), trim(p_notes), trim(p_delivery_method)
  ) returning id into v_outward_id;

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

  return jsonb_build_object(
    'ok', true,
    'outward_id', v_outward_id,
    'ledger_id', v_ledger.id,
    'balance_after', v_ledger.balance_after,
    'replayed', false
  );
end;
$$;


-- 5. APPLY GRANTS
-- Since we dropped all conflicting duplicates, these are now fully unique!
revoke all on function public.save_inward from public, anon;
revoke all on function public.save_outward from public, anon;
grant execute on function public.save_inward to authenticated;
grant execute on function public.save_outward to authenticated;
grant execute on function public.save_inward to service_role;
grant execute on function public.save_outward to service_role;

notify pgrst, 'reload schema';
