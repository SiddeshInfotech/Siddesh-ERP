-- =============================================================================
-- 26 — BATCH & INVENTORY BUSINESS LOGIC UPDATE
-- =============================================================================

-- 1. Enums and Types
do $$ begin
  create type public.inward_status as enum ('DRAFT', 'COMPLETED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.batch_status as enum ('CREATED', 'ACTIVE', 'PARTIALLY_USED', 'FULLY_USED', 'CLOSED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- Extend barcode_status safely
alter type public.barcode_status add value if not exists 'AVAILABLE';
alter type public.barcode_status add value if not exists 'ALLOCATED';
alter type public.barcode_status add value if not exists 'INWARDED';
alter type public.barcode_status add value if not exists 'OUTWARDED';
alter type public.barcode_status add value if not exists 'DAMAGED';
alter type public.barcode_status add value if not exists 'CANCELLED';

-- 2. Extend products
alter table public.products
  add column if not exists barcode_type public.barcode_symbology default 'CODE128';

-- 3. Extend product_batches
alter table public.product_batches
  add column if not exists total_quantity integer not null default 0,
  add column if not exists generated_quantity integer not null default 0,
  add column if not exists used_quantity integer not null default 0,
  add column if not exists remaining_quantity integer not null default 0,
  add column if not exists status public.batch_status not null default 'CREATED',
  add column if not exists deleted_at timestamptz;

-- 4. Extend product_barcodes (Batch Barcodes)
alter table public.product_barcodes
  add column if not exists sequence_number integer;

-- 5. Extend inwards
alter table public.inwards
  add column if not exists status public.inward_status not null default 'DRAFT',
  add column if not exists total_quantity integer not null default 0;

-- 6. Extend inward_items
alter table public.inward_items
  add column if not exists remarks text,
  add column if not exists batch_id uuid references public.product_batches(id);

-- 7. Modify stock_balances to include batch_id and damaged_quantity
alter table public.stock_balances
  add column if not exists batch_id uuid references public.product_batches(id),
  add column if not exists damaged_quantity integer not null default 0;

-- 8. Refactor primary key for stock_balances to accommodate batch_id
alter table public.stock_balances drop constraint if exists stock_balances_pkey cascade;
alter table public.stock_balances add column if not exists id uuid primary key default gen_random_uuid();
drop index if exists public.uq_stock_balances_batch;
create unique index uq_stock_balances_batch on public.stock_balances (office_id, product_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid));


-- 9. Update RPCs
drop function if exists app.post_ledger cascade;
drop function if exists public.save_inward cascade;

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
  v_new     integer;
  v_row     public.stock_ledger;
  v_safe_batch_id uuid;
begin
  if (p_txn_type = 'INWARD' and p_qty_delta <= 0) or 
     (p_txn_type = 'OUTWARD' and p_qty_delta >= 0) then
    raise exception 'Invalid qty_delta % for %', p_qty_delta, p_txn_type;
  end if;

  v_safe_batch_id := coalesce(p_batch_id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Lock (or create) the balance row for this office+product+batch.
  select qty_on_hand into v_balance
    from public.stock_balances
   where office_id = p_office_id and product_id = p_product_id and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_safe_batch_id
     for update;

  if not found then
    insert into public.stock_balances (office_id, product_id, batch_id, qty_on_hand, qty_reserved, damaged_quantity)
    values (p_office_id, p_product_id, p_batch_id, 0, 0, 0)
    on conflict (office_id, product_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

    select qty_on_hand into v_balance
      from public.stock_balances
     where office_id = p_office_id and product_id = p_product_id and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_safe_batch_id
       for update;
  end if;

  v_new := coalesce(v_balance, 0) + p_qty_delta;

  if v_new < 0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  insert into public.stock_ledger (
    client_txn_id, office_id, product_id, product_unit_id, txn_type,
    qty_delta, balance_after, ref_type, ref_id, notes, computer_name, batch_id
  ) values (
    p_client_txn_id, p_office_id, p_product_id, p_unit_id, p_txn_type,
    p_qty_delta, v_new, p_ref_type, p_ref_id, p_notes, p_computer_name, p_batch_id
  ) returning * into v_row;

  update public.stock_balances
     set qty_on_hand = v_new, updated_at = now()
   where office_id = p_office_id and product_id = p_product_id and coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_safe_batch_id;

  return v_row;
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
    on conflict (code) do update set updated_at = now()
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


-- 10. Fix rebuild_stock_balances
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
    l.office_id,
    l.product_id,
    l.batch_id,
    sum(l.qty_delta)::integer,
    coalesce(r.qty_reserved, 0),
    coalesce(r.damaged_quantity, 0),
    now()
  from public.stock_ledger l
  left join _reserved r
    on r.office_id = l.office_id and r.product_id = l.product_id and r.batch_id is not distinct from l.batch_id
  group by l.office_id, l.product_id, l.batch_id, r.qty_reserved, r.damaged_quantity
  having sum(l.qty_delta) <> 0 or coalesce(r.qty_reserved, 0) <> 0 or coalesce(r.damaged_quantity, 0) <> 0;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;


-- 11. Fix v_current_stock to sum over batch grains
create or replace view public.v_current_stock as
select
  b.office_id,
  o.name  as office_name,
  b.product_id,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  p.name  as product_name,
  c.name  as category_name,
  br.name as brand_name,
  u.code  as uom_code,
  sum(b.qty_on_hand)::integer as qty_on_hand,
  sum(b.qty_reserved)::integer as qty_reserved,
  sum(b.qty_available)::integer as qty_available,
  p.min_stock,
  (sum(b.qty_available) <= p.min_stock) as is_low_stock,
  max(b.updated_at) as updated_at,
  sum(b.damaged_quantity)::integer as damaged_quantity
from public.stock_balances b
join public.products  p  on p.id  = b.product_id
join public.offices   o  on o.id  = b.office_id
left join public.categories c on c.id = p.category_id
left join public.brands     br on br.id = p.brand_id
left join public.uoms       u  on u.id  = p.uom_id
where p.deleted_at is null
group by 
  b.office_id, o.name, b.product_id, p.id, p.product_code, p.name, 
  c.name, br.name, u.code, p.min_stock;

-- 12. Re-grant execute to authenticated for save_inward
revoke all on function public.save_inward from public, anon;
grant execute on function public.save_inward to authenticated;
grant execute on function public.save_inward to service_role;

notify pgrst, 'reload schema';
 