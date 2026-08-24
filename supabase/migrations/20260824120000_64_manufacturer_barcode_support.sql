-- =============================================================================
-- Migration 64: Manufacturer barcode support and app-side batch creation
-- =============================================================================

-- 1. Add discriminator to product_barcodes
alter table public.product_barcodes 
  add column if not exists kind text not null default 'UNIT' 
  check (kind in ('UNIT','ALIAS'));

-- Backfill ALIAS where batch_id is null (as per the plan)
update public.product_barcodes set kind = 'ALIAS' where batch_id is null;

-- 2. Add quantity to barcode_scans
alter table public.barcode_scans 
  add column if not exists quantity int not null default 1 
  check (quantity > 0);

-- 3. Add manufacturer barcode mapping to product_batches
alter table public.product_batches 
  add column if not exists manufacturer_barcode text;

-- 4. Create scan_mobile_quantity RPC for ALIAS codes
create or replace function public.scan_mobile_quantity(
  p_code          text,
  p_client_txn_id uuid,
  p_direction     text,
  p_qty           integer default 1,
  p_device_source public.scan_source default 'CAMERA'::public.scan_source
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
declare
  v_office_id   uuid := app.current_office_id();
  v_bc          public.product_barcodes;
  v_existing    public.barcode_scans;
  v_action      public.scan_action;
  v_txn_type    public.stock_txn_type;
  v_qty_delta   integer;
  v_ref_id      uuid;
  v_ledger      public.stock_ledger;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  if p_qty <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Quantity must be greater than zero.');
  end if;

  if p_direction not in ('INWARD', 'OUTWARD') then
    return jsonb_build_object('ok', false, 'error', 'Unknown scan mode: ' || coalesce(p_direction, 'null'));
  end if;

  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  select * into v_bc
    from public.product_barcodes
   where code = p_code and office_id = v_office_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if p_direction = 'INWARD' then
    v_action     := 'RECEIVE';
    v_txn_type   := 'INWARD';
    v_qty_delta  := p_qty;
  else  -- OUTWARD
    v_action     := 'ISSUE';
    v_txn_type   := 'OUTWARD';
    v_qty_delta  := -p_qty;
    
    -- Check available stock
    declare
      v_stock integer;
    begin
      select current_stock into v_stock 
        from public.v_current_stock 
       where product_id = v_bc.product_id and office_id = v_office_id;
      if coalesce(v_stock, 0) < p_qty then
        return jsonb_build_object('ok', false, 'error', 'Insufficient stock. Available: ' || coalesce(v_stock, 0));
      end if;
    end;
  end if;

  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := v_bc.product_id,
    p_unit_id       := null,
    p_txn_type      := v_txn_type,
    p_qty_delta     := v_qty_delta,
    p_ref_type      := v_txn_type::text::public.doc_ref_type,
    p_ref_id        := v_ref_id,
    p_notes         := 'Mobile qty scan (' || p_direction || ') ' || p_code,
    p_computer_name := null,
    p_batch_id      := v_bc.batch_id
  );

  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action,
    device_source, client_txn_id, ledger_id, scanned_by, quantity
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, v_action,
    p_device_source, p_client_txn_id, v_ledger.id, auth.uid(), p_qty
  );

  return jsonb_build_object('ok', true, 'found', true, 'already', false,
    'barcode_id', v_bc.id, 'code', v_bc.code, 'ledger_id', v_ledger.id);
end;
$function$;

-- 5. Create mobile_create_inward_batch RPC
create or replace function public.mobile_create_inward_batch(
  p_client_txn_id        uuid,
  p_manufacturer_barcode text,
  p_product_id           uuid,
  p_qty                  integer,
  p_batch_code           text,
  p_device_source        public.scan_source default 'CAMERA'::public.scan_source
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
  v_supplier_id uuid;
  v_alias_code  text;
  v_alias_id    uuid;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  if (p_qty <= 0) then raise exception 'QTY_MUST_BE_POSITIVE'; end if;

  -- 1. Check ledger replay
  if app.replay_if_seen(p_client_txn_id) then
    return app.replay_result(p_client_txn_id);
  end if;

  -- 2. Create the batch, tracking the manufacturer barcode
  insert into public.product_batches (office_id, code, product_id, status, total_quantity, generated_quantity, remaining_quantity, manufacturer_barcode)
  values (v_office_id, p_batch_code, p_product_id, 'ACTIVE', p_qty, 0, p_qty, p_manufacturer_barcode)
  on conflict (office_id, code) do update set updated_at = now()
  returning id into v_resolved_batch_id;

  -- 3. Create the ALIAS barcode in product_barcodes (the manufacturer barcode itself)
  -- This allows future scans of the manufacturer barcode to resolve to this product
  v_alias_code := p_manufacturer_barcode;
  
  insert into public.product_barcodes (office_id, product_id, code, batch_id, symbology, is_primary, status, created_by, updated_by, kind)
  values (v_office_id, p_product_id, v_alias_code, v_resolved_batch_id, 'CODE128', false, 'GENERATED', auth.uid(), auth.uid(), 'ALIAS')
  on conflict (office_id, code) do update set kind = 'ALIAS', updated_by = auth.uid()
  returning id into v_alias_id;

  -- 4. Create Inward Document
  v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');

  insert into public.inwards (
    client_txn_id, office_id, inward_no, supplier_id,
    notes
  ) values (
    p_client_txn_id, v_office_id, v_inward_no, null,
    'Mobile Batch Create ' || p_manufacturer_barcode
  ) returning id into v_inward_id;

  insert into public.inward_items (office_id, inward_id, product_id, quantity, batch_id)
  values (v_office_id, v_inward_id, p_product_id, p_qty, v_resolved_batch_id);

  -- 5. Post Ledger
  v_ledger := app.post_ledger(
    p_client_txn_id => p_client_txn_id, 
    p_office_id => v_office_id,
    p_product_id => p_product_id, 
    p_unit_id => null,
    p_txn_type => 'INWARD', 
    p_qty_delta => p_qty, 
    p_ref_type => 'INWARD',
    p_ref_id => v_inward_id,
    p_batch_id => v_resolved_batch_id,
    p_notes => 'Mobile app batch creation'
  );
  
  -- 6. Insert barcode_scans for audit
  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action,
    device_source, client_txn_id, ledger_id, scanned_by, quantity
  ) values (
    v_alias_id, p_product_id, v_resolved_batch_id, v_office_id, 'RECEIVE',
    p_device_source, p_client_txn_id, v_ledger.id, auth.uid(), p_qty
  );

  return jsonb_build_object(
    'ok', true,
    'inward_id', v_inward_id,
    'ledger_id', v_ledger.id,
    'batch_id', v_resolved_batch_id,
    'replayed', false
  );
end;
$function$;

-- Update scan_lookup to return kind
create or replace function public.scan_lookup(p_code text)
returns jsonb
language sql
security definer
set search_path = public, app
as $$
  select jsonb_build_object(
    'id', p.id,
    'code', pb.code,
    'batch_id', pb.batch_id,
    'kind', pb.kind,
    'product_id', p.id,
    'name', p.name,
    'brand_name', b.name,
    'category_name', c.name,
    'base_price', p.base_price,
    'tax_rate', p.tax_rate,
    'sku', p.sku,
    'description', p.description,
    'image_url', p.image_url,
    'model', p.model,
    'status', pb.status
  )
  from public.product_barcodes pb
  join public.products p on p.id = pb.product_id
  left join public.brands b on b.id = p.brand_id
  left join public.categories c on c.id = p.category_id
  where pb.code = p_code
    and pb.office_id = app.current_office_id()
  limit 1;
$$;

revoke all on function public.scan_mobile_quantity from public, anon;
grant execute on function public.scan_mobile_quantity to authenticated, service_role;

revoke all on function public.mobile_create_inward_batch from public, anon;
grant execute on function public.mobile_create_inward_batch to authenticated, service_role;

notify pgrst, 'reload schema';
