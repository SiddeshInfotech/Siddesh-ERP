-- =============================================================================
-- Migration 54: Silo ALL Master Data (Robust / IF EXISTS)
--
-- Adds `office_id` to every remaining data table to completely isolate
-- branches from each other. Also locks down all RLS policies across 22 tables.
-- Uses safe IF EXISTS checks to prevent failures if tables were manually dropped.
-- =============================================================================

DO $$
DECLARE
  v_default_office uuid;
BEGIN
  select id into v_default_office from public.offices order by created_at asc limit 1;

  -- 1. Add office_id to tables that don't have it (with safe checks)
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'categories') THEN
    alter table public.categories add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.categories set office_id = v_default_office where office_id is null;
    alter table public.categories alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'brands') THEN
    alter table public.brands add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.brands set office_id = v_default_office where office_id is null;
    alter table public.brands alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'uoms') THEN
    alter table public.uoms add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.uoms set office_id = v_default_office where office_id is null;
    alter table public.uoms alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products') THEN
    alter table public.products add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.products set office_id = v_default_office where office_id is null;
    alter table public.products alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_barcodes') THEN
    alter table public.product_barcodes add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.product_barcodes set office_id = p.office_id from public.products p where p.id = product_barcodes.product_id and product_barcodes.office_id is null;
    update public.product_barcodes set office_id = v_default_office where office_id is null;
    alter table public.product_barcodes alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_units') THEN
    alter table public.product_units add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.product_units set office_id = p.office_id from public.products p where p.id = product_units.product_id and product_units.office_id is null;
    update public.product_units set office_id = v_default_office where office_id is null;
    alter table public.product_units alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'kit_components') THEN
    alter table public.kit_components add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.kit_components set office_id = p.office_id from public.products p where p.id = kit_components.kit_product_id and kit_components.office_id is null;
    update public.kit_components set office_id = v_default_office where office_id is null;
    alter table public.kit_components alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pendrive_details') THEN
    alter table public.pendrive_details add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.pendrive_details set office_id = pu.office_id from public.product_units pu where pu.id = pendrive_details.product_unit_id and pendrive_details.office_id is null;
    update public.pendrive_details set office_id = v_default_office where office_id is null;
    alter table public.pendrive_details alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_notes') THEN
    alter table public.product_notes add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.product_notes set office_id = p.office_id from public.products p where p.id = product_notes.product_id and product_notes.office_id is null;
    update public.product_notes set office_id = v_default_office where office_id is null;
    alter table public.product_notes alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_batches') THEN
    alter table public.product_batches add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.product_batches set office_id = p.office_id from public.products p where p.id = product_batches.product_id and product_batches.office_id is null;
    update public.product_batches set office_id = v_default_office where office_id is null;
    alter table public.product_batches alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    alter table public.suppliers add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.suppliers set office_id = v_default_office where office_id is null;
    alter table public.suppliers alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customers') THEN
    alter table public.customers add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.customers set office_id = v_default_office where office_id is null;
    alter table public.customers alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inward_items') THEN
    alter table public.inward_items add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.inward_items ii set office_id = i.office_id from public.inwards i where i.id = ii.inward_id and ii.office_id is null;
    update public.inward_items set office_id = v_default_office where office_id is null;
    alter table public.inward_items alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'outward_items') THEN
    alter table public.outward_items add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.outward_items oi set office_id = o.office_id from public.outwards o where o.id = oi.outward_id and oi.office_id is null;
    update public.outward_items set office_id = v_default_office where office_id is null;
    alter table public.outward_items alter column office_id set not null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transfer_items') THEN
    alter table public.transfer_items add column if not exists office_id uuid references public.offices(id) default app.current_office_id();
    update public.transfer_items ti set office_id = t.from_office_id from public.transfers t where t.id = ti.transfer_id and ti.office_id is null;
    update public.transfer_items set office_id = v_default_office where office_id is null;
    alter table public.transfer_items alter column office_id set not null;
  END IF;
END $$;


-- 2. Update unique indexes to be scoped per office (safe checks)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'categories') THEN
    drop index if exists public.uq_categories_name_live;
    create unique index uq_categories_name_live on public.categories (office_id, lower(name)) where deleted_at is null;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'brands') THEN
    drop index if exists public.uq_brands_name_live;
    create unique index uq_brands_name_live on public.brands (office_id, lower(name)) where deleted_at is null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'uoms') THEN
    alter table public.uoms drop constraint if exists uq_uoms_code;
    drop index if exists public.uq_uoms_code;
    create unique index uq_uoms_code on public.uoms (office_id, code);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products') THEN
    alter table public.products drop constraint if exists uq_products_product_code;
    drop index if exists public.uq_products_product_code;
    create unique index uq_products_product_code on public.products (office_id, product_code) where deleted_at is null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_barcodes') THEN
    alter table public.product_barcodes drop constraint if exists uq_product_barcode_code;
    drop index if exists public.uq_product_barcode_code;
    create unique index uq_product_barcode_code on public.product_barcodes (office_id, code);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_units') THEN
    alter table public.product_units drop constraint if exists uq_product_units_barcode;
    drop index if exists public.uq_product_units_barcode;
    create unique index uq_product_units_barcode on public.product_units (office_id, unit_barcode);
    
    alter table public.product_units drop constraint if exists uq_product_units_serial;
    drop index if exists public.uq_product_units_serial;
    create unique index uq_product_units_serial on public.product_units (office_id, product_id, serial_no) where serial_no is not null and deleted_at is null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'kit_components') THEN
    alter table public.kit_components drop constraint if exists uq_kit_component;
    drop index if exists public.uq_kit_component;
    create unique index uq_kit_component on public.kit_components (office_id, kit_product_id, component_product_id);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    drop index if exists public.uq_suppliers_name_live;
    create unique index uq_suppliers_name_live on public.suppliers (office_id, lower(name)) where deleted_at is null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customers') THEN
    drop index if exists public.uq_customers_name_live;
    create unique index uq_customers_name_live on public.customers (office_id, lower(name)) where deleted_at is null;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_batches') THEN
    alter table public.product_batches drop constraint if exists uq_product_batches_code;
    drop index if exists public.uq_product_batches_code;
    create unique index uq_product_batches_code on public.product_batches (office_id, code);
  END IF;
END $$;


-- 3. Replace all RLS Policies to strictly enforce office isolation
DO $$
DECLARE
  t text;
  v_exists boolean;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'categories', 'brands', 'uoms', 'products', 'product_barcodes', 'product_units',
    'kit_components', 'pendrive_details', 'product_notes', 'product_batches',
    'suppliers', 'customers', 'inward_items', 'outward_items', 'transfer_items',
    'barcode_scans', 'stock_ledger', 'stock_balances', 'inwards', 'outwards',
    'transfers', 'activity_logs'
  ]) LOOP
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = t) INTO v_exists;
    IF v_exists THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
      
      -- Generic readable policies (most read using deleted_at if they have it, but for simplicity, we just use office_id for read, except for those without deleted_at).
      -- To avoid dynamically guessing columns, we create specific policies for specific tables.
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'categories') THEN
    create policy categories_select on public.categories for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
    create policy categories_write on public.categories for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'brands') THEN
    create policy brands_select on public.brands for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
    create policy brands_write on public.brands for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'uoms') THEN
    create policy uoms_select on public.uoms for select to authenticated using (app.can_access_office(office_id));
    create policy uoms_write on public.uoms for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products') THEN
    create policy products_select on public.products for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
    create policy products_write on public.products for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_barcodes') THEN
    create policy product_barcodes_select on public.product_barcodes for select to authenticated using (app.can_access_office(office_id));
    create policy product_barcodes_write on public.product_barcodes for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_units') THEN
    create policy product_units_select on public.product_units for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
    create policy product_units_write on public.product_units for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'kit_components') THEN
    create policy kit_components_select on public.kit_components for select to authenticated using (app.can_access_office(office_id));
    create policy kit_components_write on public.kit_components for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pendrive_details') THEN
    create policy pendrive_details_select on public.pendrive_details for select to authenticated using (app.can_access_office(office_id));
    create policy pendrive_details_write on public.pendrive_details for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_notes') THEN
    create policy product_notes_select on public.product_notes for select to authenticated using (app.can_access_office(office_id));
    create policy product_notes_write on public.product_notes for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_batches') THEN
    create policy product_batches_select on public.product_batches for select to authenticated using (app.can_access_office(office_id));
    create policy product_batches_write on public.product_batches for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    create policy suppliers_select on public.suppliers for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
    create policy suppliers_write on public.suppliers for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customers') THEN
    create policy customers_select on public.customers for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
    create policy customers_write on public.customers for all to authenticated using (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER')) with check (app.can_access_office(office_id) and app.current_role() in ('ADMIN','STORE_MANAGER'));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inward_items') THEN
    create policy inward_items_select on public.inward_items for select to authenticated using (app.can_access_office(office_id));
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'outward_items') THEN
    create policy outward_items_select on public.outward_items for select to authenticated using (app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transfer_items') THEN
    create policy transfer_items_select on public.transfer_items for select to authenticated using (app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'barcode_scans') THEN
    create policy barcode_scans_select on public.barcode_scans for select to authenticated using (app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stock_ledger') THEN
    create policy stock_ledger_select on public.stock_ledger for select to authenticated using (app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stock_balances') THEN
    create policy stock_balances_select on public.stock_balances for select to authenticated using (app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inwards') THEN
    create policy inwards_select on public.inwards for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'outwards') THEN
    create policy outwards_select on public.outwards for select to authenticated using (deleted_at is null and app.can_access_office(office_id));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transfers') THEN
    create policy transfers_select on public.transfers for select to authenticated using (deleted_at is null and (app.can_access_office(from_office_id) or app.can_access_office(to_office_id)));
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
    create policy activity_logs_select on public.activity_logs for select to authenticated using (app.can_access_office(office_id));
  END IF;
END $$;


-- 4. Rebuild v_current_stock without CROSS JOIN (since products are siloed now)
drop view if exists public.v_current_stock cascade;

create or replace view public.v_current_stock as
select
  p.office_id as office_id,
  o.name as office_name,
  p.id as product_id,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  p.name as product_name,
  c.name as category_name,
  br.name as brand_name,
  u.code as uom_code,
  coalesce(sum(b.qty_on_hand), 0)::integer as qty_on_hand,
  coalesce(sum(b.qty_reserved), 0)::integer as qty_reserved,
  coalesce(sum(b.qty_available), 0)::integer as qty_available,
  p.min_stock,
  (coalesce(sum(b.qty_available), 0) <= p.min_stock) as is_low_stock,
  coalesce(max(b.updated_at), p.updated_at) as updated_at,
  coalesce(sum(b.damaged_quantity), 0)::integer as damaged_quantity
from public.products p
join public.offices o on o.id = p.office_id
left join public.stock_balances b on b.product_id = p.id and b.office_id = p.office_id
left join public.categories c on c.id = p.category_id
left join public.brands br on br.id = p.brand_id
left join public.uoms u on u.id = p.uom_id
where p.deleted_at is null
  and app.can_access_office(p.office_id)
group by
  p.office_id, o.name, p.id, p.product_code, p.name, c.name, br.name, u.code, p.min_stock, p.updated_at;

grant select on public.v_current_stock to authenticated;
grant select on public.v_current_stock to service_role;
alter view public.v_current_stock set (security_invoker = on);

-- Recreate v_stock_dashboard
create or replace view public.v_stock_dashboard as
select
  cs.office_id,
  cs.office_name,
  cs.product_id,
  cs.sku_barcode,
  cs.product_name,
  cs.category_name,
  cs.brand_name,
  cs.uom_code,
  coalesce(m.opening_qty, 0) as opening_qty,
  coalesce(m.inward_qty, 0)  as inward_qty,
  coalesce(m.outward_qty, 0) as outward_qty,
  cs.qty_on_hand,
  cs.qty_reserved,
  cs.qty_available,
  cs.min_stock,
  cs.is_low_stock,
  pr.product_code
from public.v_current_stock cs
join public.products pr on pr.id = cs.product_id
left join (
  select
    product_id,
    office_id,
    coalesce(sum(qty_delta) filter (where txn_type = 'OPENING'), 0) as opening_qty,
    coalesce(sum(qty_delta) filter (where txn_type = 'INWARD'), 0)  as inward_qty,
    coalesce(-sum(qty_delta) filter (where txn_type = 'OUTWARD'), 0) as outward_qty
  from public.stock_ledger
  group by product_id, office_id
) m on m.product_id = cs.product_id and m.office_id = cs.office_id;

grant select on public.v_stock_dashboard to authenticated;
grant select on public.v_stock_dashboard to service_role;
alter view public.v_stock_dashboard set (security_invoker = on);

-- Recreate v_inward_history
create or replace view public.v_inward_history as
select
  ii.id,
  i.received_at,
  i.inward_no,
  p.name as product_name,
  pb.code as batch_code,
  ii.quantity as inward_qty,
  coalesce(ii.quantity - (select coalesce(sum(quantity), 0) from public.outward_items where batch_id = ii.batch_id), 0) as remaining_qty,
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
  left join public.v_current_stock vcs on vcs.product_id = ii.product_id and vcs.office_id = i.office_id
  left join public.v_batch_registry reg on reg.batch_id = ii.batch_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;
alter view public.v_inward_history set (security_invoker = on);

-- Recreate v_outward_history
create or replace view public.v_outward_history as
select
  oi.id,
  o.issued_at,
  o.outward_no,
  p.name as product_name,
  pb.code as batch_code,
  oi.quantity as outward_qty,
  coalesce((select coalesce(sum(quantity), 0) from public.inward_items where batch_id = oi.batch_id) - (select coalesce(sum(quantity), 0) from public.outward_items where batch_id = oi.batch_id), 0) as remaining_qty,
  coalesce(vcs.qty_on_hand, 0) as total_qty,
  o.outward_type,
  oi.product_id,
  o.office_id,
  oi.created_at,
  c.name           as party_name,
  c.contact_person as contact_person,
  c.mobile         as party_mobile,
  c.gst_no         as party_gst,
  c.address        as party_address,
  o.invoice_no,
  o.sales_order_no,
  o.handed_over_by,
  o.received_by,
  o.delivery_method,
  o.notes
from public.outward_items oi
  join public.outwards o on o.id = oi.outward_id
  join public.products p on p.id = oi.product_id
  left join public.product_batches pb on pb.id = oi.batch_id
  left join public.customers c on c.id = o.customer_id
  left join public.v_current_stock vcs on vcs.product_id = oi.product_id and vcs.office_id = o.office_id;

grant select on public.v_outward_history to authenticated;
grant select on public.v_outward_history to service_role;
alter view public.v_outward_history set (security_invoker = on);


-- 5. Fix scan_lookup for siloed offices
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
     and b.office_id = v_office_id
     and p.deleted_at is null
   limit 1;

  if (v_product is null) then
    select p.* into v_product
      from public.product_units u
      join public.products p on p.id = u.product_id
     where u.unit_barcode = p_code 
       and u.office_id = v_office_id
       and u.deleted_at is null
     limit 1;
    if (v_product is not null) then
      select * into v_unit from public.product_units where unit_barcode = p_code and office_id = v_office_id limit 1;
    end if;
  end if;

  if (v_product is null) then
    select * into v_product
      from public.products p
     where p.sku_barcode = p_code 
       and p.office_id = v_office_id
       and p.deleted_at is null
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
grant execute on function public.scan_lookup to authenticated;
grant execute on function public.scan_lookup to service_role;

notify pgrst, 'reload schema';
