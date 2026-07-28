-- =============================================================================
-- 12 — BATCH MANAGEMENT & OUTWARD DELIVERY METHOD
-- =============================================================================

-- 1. Batch Sequence
create sequence if not exists app.batch_no_seq start 1;

-- 2. Batch Table
create table public.product_batches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null, -- e.g. BATCH-260721-00001
  product_id  uuid not null references public.products(id) on delete cascade,
  
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_product_batches_code check (length(trim(code)) > 0),
  constraint uq_product_batches_code unique (code)
);

create trigger tg_product_batches_audit before insert or update on public.product_batches
  for each row execute function app.tg_set_audit();

-- 3. Add batch_id to barcodes to track the generated item-level barcodes
alter table public.product_barcodes add column batch_id uuid references public.product_batches(id) on delete cascade;

-- 4. Add batch_id to transactions and ledger
alter table public.inward_items add column batch_id uuid references public.product_batches(id);
alter table public.outward_items add column batch_id uuid references public.product_batches(id);
alter table public.stock_ledger add column batch_id uuid references public.product_batches(id);

-- 5. Add delivery_method to outwards
alter table public.outwards add column delivery_method text;

-- 6. View for batch-wise quantity
create or replace view public.v_stock_balances_by_batch as
select 
  office_id, 
  product_id, 
  batch_id, 
  sum(qty_delta) as qty_on_hand
from public.stock_ledger
group by office_id, product_id, batch_id;

-- 7. Update RPCs
drop function if exists app.post_ledger cascade;
drop function if exists public.save_inward cascade;
drop function if exists public.save_outward cascade;

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
  p_computer_name text default null,
  p_batch_id      uuid default null
) returns public.stock_ledger
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_balance integer;
  v_ledger  public.stock_ledger;
begin
  if (p_txn_type = 'INWARD' and p_qty_delta <= 0) or 
     (p_txn_type = 'OUTWARD' and p_qty_delta >= 0) then
    raise exception 'Invalid qty_delta % for %', p_qty_delta, p_txn_type;
  end if;

  select coalesce(sum(qty_delta), 0) into v_balance
    from public.stock_ledger
   where office_id = p_office_id
     and product_id = p_product_id;

  v_balance := v_balance + p_qty_delta;
  if (v_balance < 0) then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  insert into public.stock_ledger (
    client_txn_id, office_id, product_id, unit_id, txn_type,
    qty_delta, balance_after, ref_type, ref_id, notes, computer_name, batch_id
  ) values (
    p_client_txn_id, p_office_id, p_product_id, p_unit_id, p_txn_type,
    p_qty_delta, v_balance, p_ref_type, p_ref_id, p_notes, p_computer_name, p_batch_id
  ) returning * into v_ledger;

  return v_ledger;
end;
$$;


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

-- 8. Add Batch to scan_lookup
drop function if exists public.scan_lookup cascade;
create or replace function public.scan_lookup(p_code text) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_product record;
  v_unit    record;
  v_batch   record;
  v_stock   record;
  v_office_id uuid;
begin
  v_office_id := app.current_office_id();
  if (v_office_id is null) then raise exception 'NOT_IN_OFFICE'; end if;

  select p.*, b.batch_id into v_product
    from public.product_barcodes b
    join public.products p on p.id = b.product_id
   where b.code = p_code 
     and p.deleted_at is null
   limit 1;

  if (v_product is null) then
    select p.* into v_product
      from public.product_units u
      join public.products p on p.id = u.product_id
     where u.unit_barcode = p_code and u.deleted_at is null
     limit 1;
    if (v_product is not null) then
      select * into v_unit from public.product_units where unit_barcode = p_code limit 1;
    end if;
  end if;

  if (v_product is null) then
    select * into v_product
      from public.products p
     where p.sku_barcode = p_code and p.deleted_at is null
     limit 1;
  end if;

  if (v_product is null) then
    return jsonb_build_object('found', false);
  end if;

  if v_product.batch_id is not null then
    select * into v_batch from public.product_batches where id = v_product.batch_id limit 1;
  end if;

  select * into v_stock from public.v_stock_balances
   where office_id = v_office_id and product_id = v_product.id;

  return jsonb_build_object(
    'found', true,
    'match_type', case when v_unit is not null then 'UNIT' else 'PRODUCT' end,
    'product', jsonb_build_object(
      'id',          v_product.id,
      'sku_barcode', v_product.sku_barcode,
      'name',        v_product.name,
      'unit',        (select code from public.uoms where id = v_product.uom_id),
      'is_kit',      v_product.is_kit,
      'tracking_mode', v_product.tracking_mode
    ),
    'unit', case when v_unit is not null then
      jsonb_build_object(
        'id',           v_unit.id,
        'serial_no',    v_unit.serial_no,
        'unit_barcode', v_unit.unit_barcode,
        'status',       v_unit.status
      ) else null end,
    'batch', case when v_batch is not null then
      jsonb_build_object(
        'id',   v_batch.id,
        'code', v_batch.code
      ) else null end,
    'stock', jsonb_build_object(
      'qty_on_hand',   coalesce(v_stock.qty_on_hand, 0),
      'qty_allocated', coalesce(v_stock.qty_allocated, 0),
      'qty_available', coalesce(v_stock.qty_available, 0)
    )
  );
end;
$$;

-- =============================================================================
-- GRANTS
-- =============================================================================
revoke all on function public.save_inward from public, anon;
revoke all on function public.save_outward from public, anon;
revoke all on function public.scan_lookup from public, anon;

grant execute on function public.save_inward to authenticated;
grant execute on function public.save_outward to authenticated;
grant execute on function public.scan_lookup to authenticated;
grant execute on function public.save_inward to service_role;
grant execute on function public.save_outward to service_role;
grant execute on function public.scan_lookup to service_role;

notify pgrst, 'reload schema';
