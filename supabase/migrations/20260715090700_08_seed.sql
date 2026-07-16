-- =============================================================================
-- 08 — SEED DATA
-- Reference data + demo products drawn from SRD §3.
-- Safe to re-run: every insert is guarded by ON CONFLICT / NOT EXISTS.
--
-- The demo products exist so Shrusti has something real to scan on day 1.
-- Delete the DEMO block before go-live; keep offices and UOMs.
-- =============================================================================

-- --- Units of measure --------------------------------------------------------
insert into public.uoms (code, name) values
  ('PCS', 'Pieces'),
  ('BOX', 'Box'),
  ('SET', 'Set'),
  ('MTR', 'Meter'),
  ('KIT', 'Kit')
on conflict (code) do nothing;

-- --- Offices (client chat §8) ------------------------------------------------
insert into public.offices (code, name, city, state)
select * from (values
  ('PUNE',   'Pune Head Office', 'Pune',   'Maharashtra'),
  ('NASHIK', 'Nashik Branch',    'Nashik', 'Maharashtra'),
  ('MUMBAI', 'Mumbai Branch',    'Mumbai', 'Maharashtra')
) as v(code, name, city, state)
where not exists (select 1 from public.offices o where o.code = v.code);

-- --- Categories (SRD §3) -----------------------------------------------------
insert into public.categories (name)
select * from (values
  ('AI Lab'),
  ('Digital Products'),
  ('Office Items')
) as v(name)
where not exists (select 1 from public.categories c where lower(c.name) = lower(v.name));

-- --- Brands ------------------------------------------------------------------
insert into public.brands (name)
select * from (values
  ('Arduino'), ('SanDisk'), ('Generic'), ('Logitech')
) as v(name)
where not exists (select 1 from public.brands b where lower(b.name) = lower(v.name));


-- =============================================================================
-- DEMO PRODUCTS  (SRD §3 examples) — remove before go-live
-- sku_barcode auto-generates (ST00000001... per SRD §4) and the trigger in 03_products.sql
-- auto-creates the matching product_barcodes row, so these are scannable
-- immediately.
-- =============================================================================
do $$
declare
  v_ailab   uuid := (select id from public.categories where lower(name) = 'ai lab');
  v_digital uuid := (select id from public.categories where lower(name) = 'digital products');
  v_office  uuid := (select id from public.categories where lower(name) = 'office items');
  v_arduino uuid := (select id from public.brands where lower(name) = 'arduino');
  v_sandisk uuid := (select id from public.brands where lower(name) = 'sandisk');
  v_generic uuid := (select id from public.brands where lower(name) = 'generic');
  v_pcs     uuid := (select id from public.uoms where code = 'PCS');
  v_kit_uom uuid := (select id from public.uoms where code = 'KIT');
begin
  if exists (select 1 from public.products limit 1) then
    raise notice 'Products already exist -- skipping demo seed.';
    return;
  end if;

  -- AI Lab components (SRD §3)
  insert into public.products (name, category_id, brand_id, uom_id, model_number, min_stock, tracking_mode) values
    ('Arduino UNO',      v_ailab, v_arduino, v_pcs, 'A000066', 10, 'QUANTITY'),
    ('Servo Motor',      v_ailab, v_generic, v_pcs, 'SG90',    20, 'QUANTITY'),
    ('RFID Module',      v_ailab, v_generic, v_pcs, 'RC522',   10, 'QUANTITY'),
    ('Ultrasonic Sensor',v_ailab, v_generic, v_pcs, 'HC-SR04', 15, 'QUANTITY'),
    ('Breadboard',       v_ailab, v_generic, v_pcs, 'MB-102',  10, 'QUANTITY'),
    ('Jumper Wires',     v_ailab, v_generic, v_pcs, 'M-M-40',  100,'QUANTITY');

  -- Digital products (SRD §3)
  insert into public.products (name, category_id, brand_id, uom_id, model_number, min_stock, tracking_mode) values
    ('64 GB Pen Drive',  v_digital, v_sandisk, v_pcs, 'SDCZ50-064G', 25, 'QUANTITY'),
    ('128 GB Pen Drive', v_digital, v_sandisk, v_pcs, 'SDCZ50-128G', 15, 'QUANTITY');

  -- Office items (SRD §3)
  insert into public.products (name, category_id, brand_id, uom_id, min_stock, tracking_mode) values
    ('Mouse',      v_office, v_generic, v_pcs, 5, 'QUANTITY'),
    ('Keyboard',   v_office, v_generic, v_pcs, 5, 'QUANTITY'),
    ('HDMI Cable', v_office, v_generic, v_pcs, 8, 'QUANTITY');

  -- SERIAL-tracked, per SRD §18B (VR headsets / drones get individual barcodes)
  insert into public.products (name, category_id, brand_id, uom_id, model_number, min_stock, tracking_mode) values
    ('VR Headset', v_ailab, v_generic, v_pcs, 'VR-2024', 2, 'SERIAL'),
    ('Drone Kit',  v_ailab, v_generic, v_pcs, 'DRN-100', 2, 'SERIAL');

  -- Kit / BOM demo (SRD §18A): "1 AI Lab Kit = 1 Arduino + 1 Servo + 20 Jumpers"
  insert into public.products (name, category_id, brand_id, uom_id, min_stock, is_kit, tracking_mode)
  values ('AI Lab Kit (Standard)', v_ailab, v_generic, v_kit_uom, 2, true, 'QUANTITY');

  insert into public.kit_components (kit_product_id, component_product_id, quantity)
  select
    (select id from public.products where name = 'AI Lab Kit (Standard)'),
    p.id,
    v.qty
  from (values
    ('Arduino UNO',       1),
    ('Servo Motor',       1),
    ('Ultrasonic Sensor', 1),
    ('RFID Module',       1),
    ('Breadboard',        1),
    ('Jumper Wires',     20)
  ) as v(pname, qty)
  join public.products p on p.name = v.pname;

  -- A manufacturer barcode (SRD §4 Option B) so scan_lookup's alias path is
  -- exercised on day 1, not discovered broken in week 3.
  insert into public.product_barcodes (product_id, code, symbology, is_primary)
  select id, '8901234567890', 'EAN13', false
  from public.products where name = '64 GB Pen Drive';

  raise notice 'Demo products seeded.';
end $$;


-- =============================================================================
-- OPENING STOCK  (SRD §7 "Opening Stock")
-- Posts OPENING ledger rows so there is stock to outward during the demo.
-- Requires an authenticated session; run from the SQL editor as a logged-in
-- user, or after creating your first admin.
-- =============================================================================
do $$
declare
  v_pune uuid := (select id from public.offices where code = 'PUNE');
  v_p    record;
begin
  if v_pune is null then return; end if;
  if exists (select 1 from public.stock_ledger limit 1) then
    raise notice 'Ledger already has rows -- skipping opening stock.';
    return;
  end if;

  for v_p in
    select id, name from public.products where tracking_mode = 'QUANTITY' and not is_kit
  loop
    perform app.post_ledger(
      gen_random_uuid(),     -- fresh client_txn_id per opening row
      v_pune, v_p.id, null,
      'OPENING', 50,
      null, null,
      'Opening balance at go-live', 'SEED'
    );
  end loop;

  raise notice 'Opening stock posted for Pune.';
end $$;
