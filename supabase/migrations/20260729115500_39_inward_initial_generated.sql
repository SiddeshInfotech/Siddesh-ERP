-- =============================================================================
-- 39 — INWARD ENTRY CREATES GENERATED BARCODES, NOT INWARDED
-- =============================================================================

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

  -- Insert barcodes for this batch initially as 'GENERATED'
  if (p_barcodes is not null and array_length(p_barcodes, 1) > 0) then
    v_barcode_count := array_length(p_barcodes, 1);
    foreach v_bc in array p_barcodes loop
      insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary, status)
      values (p_product_id, v_bc, v_resolved_batch_id, 'CODE128', false, 'GENERATED')
      on conflict (code) do update set status = 'GENERATED';
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

revoke all on function public.save_inward from public, anon;
grant execute on function public.save_inward to authenticated;
grant execute on function public.save_inward to service_role;

-- Redefine v_inward_history to include barcode status metrics by joining v_batch_registry
create or replace view public.v_inward_history as
select
  ii.id,
  i.received_at,
  i.inward_no,
  p.name as product_name,
  pb.code as batch_code,
  ii.quantity as inward_qty,
  coalesce(sbb.qty_on_hand, 0) as remaining_qty,
  coalesce(vcs.qty_on_hand, 0) as total_qty,
  i.brought_by,
  ii.product_id,
  i.office_id,
  ii.created_at,
  s.name             as supplier_name,
  s.mobile           as supplier_mobile,
  s.gst_no           as supplier_gst,
  s.address          as supplier_address,
  i.invoice_no,
  i.invoice_date,
  i.purchase_order_no,
  i.notes,
  i.invoice_file_path,
  ii.batch_id        as batch_id,
  coalesce(reg.total_barcodes, 0) as total_barcodes,
  coalesce(reg.qty_generated, 0) as qty_generated,
  coalesce(reg.qty_in_stock, 0) as qty_in_stock,
  coalesce(reg.qty_outward, 0) as qty_outward,
  coalesce(reg.qty_void, 0) as qty_void
from public.inward_items ii
  join public.inwards i on i.id = ii.inward_id
  join public.products p on p.id = ii.product_id
  left join public.product_batches pb on pb.id = ii.batch_id
  left join public.suppliers s on s.id = i.supplier_id
  left join public.v_stock_balances_by_batch sbb on sbb.batch_id = ii.batch_id and sbb.office_id = i.office_id
  left join public.v_current_stock vcs on vcs.product_id = ii.product_id and vcs.office_id = i.office_id
  left join public.v_batch_registry reg on reg.batch_id = ii.batch_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;

notify pgrst, 'reload schema';
