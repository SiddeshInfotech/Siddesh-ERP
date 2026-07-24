-- Migration to seed the barcodes from Barcode_Labels_medium_1784787573050 (1).pdf
-- This allows testing scanner lookups for these specific barcodes in local dev.

do $$
declare
  v_prod_id uuid;
  v_batch_id uuid;
  v_office_id uuid;
  v_client_txn_id uuid := 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6'; -- hardcoded safe UUID
  v_inward_id uuid;
  v_supplier_id uuid;
  v_inward_no text;
  v_barcodes text[] := array[
    '128-260723-0009',
    '128-260723-0010',
    '128-260723-0011',
    '128-260723-0012',
    '128-260723-0013',
    '128-260723-0014',
    '128-260723-0015',
    '128-260723-0016',
    '128-260723-0017',
    '128-260723-0018'
  ];
  v_bc text;
begin
  -- 1. Find the target product (128 GB Pen Drive)
  select id into v_prod_id from public.products where name = '128 GB Pen Drive' limit 1;
  if v_prod_id is null then
    raise notice 'Product 128 GB Pen Drive not found, skipping seeding barcodes.';
    return;
  end if;

  -- 2. Find the Pune office to post stock to
  select id into v_office_id from public.offices where code = 'PUNE' limit 1;
  if v_office_id is null then
    raise notice 'PUNE office not found, skipping seeding barcodes.';
    return;
  end if;

  -- 3. Create or find the batch BATCH-260723-0001
  insert into public.product_batches (code, product_id)
  values ('BATCH-260723-0001', v_prod_id)
  on conflict (code) do update set updated_at = now()
  returning id into v_batch_id;

  -- 4. Create or find supplier
  insert into public.suppliers (name, mobile, gst_no)
  values ('SanDisk India Ltd', '9876543210', '27SNDSK1234A1Z5')
  on conflict (lower(name)) where deleted_at is null do update set mobile = excluded.mobile
  returning id into v_supplier_id;

  -- 5. Insert barcodes for the batch
  foreach v_bc in array v_barcodes loop
    insert into public.product_barcodes (product_id, code, batch_id, symbology, is_primary, status)
    values (v_prod_id, v_bc, v_batch_id, 'CODE128', false, 'GENERATED')
    on conflict (code) do nothing;
  end loop;

  -- 6. Create inward entry (if not already seeded)
  if not exists (select 1 from public.inwards where client_txn_id = v_client_txn_id) then
    v_inward_no := app.next_doc_no('IN', 'app.inward_no_seq');
    
    insert into public.inwards (
      id, client_txn_id, office_id, inward_no, supplier_id, supplier_name, supplier_mobile,
      supplier_gst, invoice_no, invoice_date, purchase_order_no, brought_by, notes
    ) values (
      'e1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6', v_client_txn_id, v_office_id, v_inward_no, v_supplier_id, 'SanDisk India Ltd', '9876543210',
      '27SNDSK1234A1Z5', 'INV-2026-0009', '2026-07-23', 'PO-9999', 'Ramesh Kumar', 'Seeding demo barcodes for PDF scan test.'
    ) returning id into v_inward_id;

    insert into public.inward_items (inward_id, product_id, qty, batch_id)
    values (v_inward_id, v_prod_id, 10, v_batch_id);

    -- Post to stock ledger
    perform app.post_ledger(
      p_client_txn_id := v_client_txn_id,
      p_office_id     := v_office_id,
      p_product_id    := v_prod_id,
      p_unit_id       := null,
      p_txn_type      := 'INWARD',
      p_qty_delta     := 10,
      p_ref_type      := 'INWARD',
      p_ref_id        := v_inward_id,
      p_notes         := 'Seeding demo barcodes for PDF scan test.',
      p_batch_id      := v_batch_id
    );
  end if;

end $$;
