-- =============================================================================
-- Migration 66: Manufacturer barcode sequence mapping support
-- =============================================================================

-- 1. Add manufacturer_barcode column to product_barcodes table
alter table public.product_barcodes 
  add column if not exists manufacturer_barcode text;

-- 2. Rebuild v_batch_barcodes view to include manufacturer_barcode
create or replace view public.v_batch_barcodes as
select
  bc.id,
  bc.product_id,
  bc.batch_id,
  bc.code,
  bc.symbology,
  bc.status,
  bc.created_at,
  latest.scanned_at        as scanned_at,
  latest.device_source     as device_source,
  scanner.full_name        as scanned_by_name,
  bc.created_at            as generated_at,
  gen.full_name            as generated_by_name,
  rcv.scanned_at           as inwarded_at,
  iss.scanned_at           as outwarded_at,
  office.name              as scanned_office_name,
  bc.manufacturer_barcode  as manufacturer_barcode
from public.product_barcodes bc
left join public.profiles gen on gen.id = bc.created_by
left join lateral (
  select s.scanned_at
  from public.barcode_scans s
  where s.barcode_id = bc.id and s.action = 'RECEIVE'
  order by s.scanned_at desc
  limit 1
) rcv on true
left join lateral (
  select s.scanned_at
  from public.barcode_scans s
  where s.barcode_id = bc.id and s.action = 'ISSUE'
  order by s.scanned_at desc
  limit 1
) iss on true
left join lateral (
  select s.scanned_at, s.device_source, s.scanned_by, s.office_id
  from public.barcode_scans s
  where s.barcode_id = bc.id
  order by s.scanned_at desc
  limit 1
) latest on true
left join public.profiles scanner on scanner.id = latest.scanned_by
left join public.offices office on office.id = latest.office_id;

-- 3. Create the batch and sequence generator RPC
create or replace function public.create_manufacturer_batch_with_sequences(
  p_client_txn_id        uuid,
  p_product_id           uuid,
  p_batch_code           text,
  p_qty                  integer,
  p_manufacturer_barcode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
declare
  v_office_id   uuid := app.current_office_id();
  v_resolved_batch_id uuid;
  v_inward_id   uuid;
  v_inward_no   text;
  v_ledger      public.stock_ledger;
  v_product_name text;
  v_prefix      text;
  v_code_prefix text;
  v_last_code   text;
  v_match       text[];
  v_last_num_str text;
  v_pad_len     integer;
  v_start_seq   integer;
  v_code        text;
  v_lock        uuid;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  if (p_qty <= 0) then raise exception 'QTY_MUST_BE_POSITIVE'; end if;

  -- Idempotency check
  if app.replay_if_seen(p_client_txn_id) then
    select id into v_inward_id from public.inwards where client_txn_id = p_client_txn_id;
    select batch_id into v_resolved_batch_id from public.inward_items where inward_id = v_inward_id limit 1;
    return jsonb_build_object(
      'ok', true,
      'batch_id', v_resolved_batch_id,
      'inward_id', v_inward_id,
      'replayed', true
    );
  end if;

  -- Lock product row to serialize sequence generation
  select id into v_lock from public.products where id = p_product_id for update;

  -- Check batch code uniqueness
  if exists (select 1 from public.product_batches where code = p_batch_code and office_id = v_office_id) then
    raise exception 'Batch code % already exists for this office.', p_batch_code;
  end if;

  -- Check if manufacturer barcode is already mapped globally
  if exists (
    select 1 from public.product_barcodes 
    where (code = p_manufacturer_barcode or manufacturer_barcode = p_manufacturer_barcode) 
      and office_id = v_office_id
  ) then
    raise exception 'Manufacturer barcode already mapped.';
  end if;

  -- Determine SKU prefix from product name
  select name into v_product_name from public.products where id = p_product_id;
  v_prefix := upper(regexp_replace(v_product_name, '[^A-Za-z0-9]', '', 'g'));
  v_prefix := substring(v_prefix from 1 for 4);
  if v_prefix is null or v_prefix = '' then v_prefix := 'PROD'; end if;

  -- Find last sequence number for this prefix
  select code into v_last_code from public.product_barcodes
  where product_id = p_product_id
    and code like (v_prefix || '-%')
    and office_id = v_office_id
  order by code desc limit 1;

  if v_last_code is not null then
    v_match := regexp_matches(v_last_code, '^(.*?)(\d+)$');
    if v_match is not null and array_length(v_match, 1) = 2 then
      v_code_prefix := v_match[1];
      v_last_num_str := v_match[2];
      v_pad_len := length(v_last_num_str);
      v_start_seq := v_last_num_str::integer + 1;
    else
      v_code_prefix := v_prefix || '-' || to_char(now(), 'YYMMDD') || '-';
      v_start_seq := 1;
      v_pad_len := 7;
    end if;
  else
    v_code_prefix := v_prefix || '-' || to_char(now(), 'YYMMDD') || '-';
    v_start_seq := 1;
    v_pad_len := 7;
  end if;

  -- Insert the batch
  insert into public.product_batches (
    office_id, code, product_id, status, total_quantity, generated_quantity, remaining_quantity, manufacturer_barcode
  ) values (
    v_office_id, p_batch_code, p_product_id, 'ACTIVE', p_qty, p_qty, p_qty, p_manufacturer_barcode
  ) returning id into v_resolved_batch_id;

  -- Insert the pre-generated internal barcodes
  for i in 0 .. (p_qty - 1) loop
    v_code := v_code_prefix || lpad((v_start_seq + i)::text, v_pad_len, '0');
    insert into public.product_barcodes (
      office_id, product_id, code, batch_id, symbology, is_primary, status, created_by, updated_by, kind
    ) values (
      v_office_id, p_product_id, v_code, v_resolved_batch_id, 'CODE128', false, 'GENERATED', auth.uid(), auth.uid(), 'UNIT'
    );
  end loop;

  -- Create Inward Document
  v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');

  insert into public.inwards (
    client_txn_id, office_id, inward_no, supplier_id, notes
  ) values (
    p_client_txn_id, v_office_id, v_inward_no, null, 'Mobile Batch Create ' || p_manufacturer_barcode
  ) returning id into v_inward_id;

  insert into public.inward_items (office_id, inward_id, product_id, quantity, batch_id)
  values (v_office_id, v_inward_id, p_product_id, p_qty, v_resolved_batch_id);

  -- Post Stock Ledger (Full Quantity immediately increases available stock)
  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := p_product_id,
    p_unit_id       := null,
    p_txn_type      := 'INWARD',
    p_qty_delta     := p_qty,
    p_ref_type      := 'INWARD',
    p_ref_id        := v_inward_id,
    p_batch_id      := v_resolved_batch_id,
    p_notes         := 'Mobile app batch creation with pre-generated barcodes'
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_resolved_batch_id,
    'inward_id', v_inward_id,
    'replayed', false
  );
end;
$function$;

-- 4. Create the physical manufacturer barcode mapper RPC
create or replace function public.map_manufacturer_barcode(
  p_code                 text,
  p_batch_id             uuid,
  p_client_txn_id        uuid,
  p_device_source        public.scan_source default 'CAMERA'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
declare
  v_office_id    uuid := app.current_office_id();
  v_bc           public.product_barcodes;
  v_next_bc      public.product_barcodes;
  v_existing     public.barcode_scans;
  v_other_batch_code text;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  -- Check idempotency
  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  -- Check if scanned barcode already exists as code or mapped barcode
  select * into v_bc 
    from public.product_barcodes 
   where (code = p_code or manufacturer_barcode = p_code) 
     and office_id = v_office_id;

  if found then
    if v_bc.batch_id is null or v_bc.batch_id != p_batch_id then
      select code into v_other_batch_code from public.product_batches where id = v_bc.batch_id;
      return jsonb_build_object(
        'ok', false, 
        'error', 'This manufacturer barcode already belongs to batch ' || coalesce(v_other_batch_code, 'Unknown') || '.'
      );
    end if;

    if v_bc.status in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', false, 'error', 'Manufacturer barcode already mapped.');
    end if;

    -- Map/inward directly
    update public.product_barcodes
       set status = 'INWARDED', 
           manufacturer_barcode = p_code, 
           updated_by = auth.uid(), 
           updated_at = now()
     where id = v_bc.id;

    insert into public.barcode_scans (
      barcode_id, product_id, batch_id, office_id, action,
      device_source, client_txn_id, ledger_id, scanned_by
    ) values (
      v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, 'RECEIVE',
      p_device_source, p_client_txn_id, null, auth.uid()
    );

    return jsonb_build_object('ok', true, 'found', true, 'barcode_id', v_bc.id, 'code', v_bc.code);
  end if;

  -- Find next available internal barcode of this batch
  select * into v_next_bc 
    from public.product_barcodes 
   where batch_id = p_batch_id 
     and status = 'GENERATED' 
     and manufacturer_barcode is null 
     and office_id = v_office_id
   order by code asc 
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'All units in this batch have already been inwarded.');
  end if;

  -- Map and update status
  update public.product_barcodes
     set status = 'INWARDED', 
         manufacturer_barcode = p_code, 
         updated_by = auth.uid(), 
         updated_at = now()
   where id = v_next_bc.id;

  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action,
    device_source, client_txn_id, ledger_id, scanned_by
  ) values (
    v_next_bc.id, v_next_bc.product_id, v_next_bc.batch_id, v_office_id, 'RECEIVE',
    p_device_source, p_client_txn_id, null, auth.uid()
  );

  return jsonb_build_object('ok', true, 'found', true, 'barcode_id', v_next_bc.id, 'code', v_next_bc.code);
end;
$function$;

-- 5. Enable permissions for the new RPCs
grant execute on function public.create_manufacturer_batch_with_sequences to authenticated, service_role;
grant execute on function public.map_manufacturer_barcode to authenticated, service_role;

notify pgrst, 'reload schema';
