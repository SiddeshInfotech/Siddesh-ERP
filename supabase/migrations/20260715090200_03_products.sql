-- =============================================================================
-- 03 — PRODUCT MASTER  (SRD §3, §4, §18)
-- categories, brands, uoms, products, product_barcodes, product_units,
-- kit_components, pendrive_details
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lookups. Normalised out of `products` per principles §5:
--   BAD:  products.category_name text
--   GOOD: products.category_id -> categories.id
-- Renaming "AI Lab" becomes one UPDATE instead of a mass rewrite, and typos
-- ("AI lab" / "Ai Lab") can't fragment your reports.
-- -----------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references public.categories(id),  -- self-FK: AI Lab > Sensors
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,
  constraint chk_categories_name      check (length(trim(name)) > 0),
  constraint chk_categories_no_self   check (parent_id is distinct from id)
);
create unique index uq_categories_name_live on public.categories (lower(name)) where deleted_at is null;
create index ix_categories_parent on public.categories (parent_id);
create trigger tg_categories_audit before insert or update on public.categories
  for each row execute function app.tg_set_audit();


create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,
  constraint chk_brands_name check (length(trim(name)) > 0)
);
create unique index uq_brands_name_live on public.brands (lower(name)) where deleted_at is null;
create trigger tg_brands_audit before insert or update on public.brands
  for each row execute function app.tg_set_audit();


-- Unit of measure (SRD §3 "Unit"). Table not enum: users add units at runtime.
create table public.uoms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,          -- PCS, BOX, MTR, SET
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,
  constraint chk_uoms_code check (code ~ '^[A-Z]{2,10}$')
);
create unique index uq_uoms_code on public.uoms (code);
create trigger tg_uoms_audit before insert or update on public.uoms
  for each row execute function app.tg_set_audit();


-- -----------------------------------------------------------------------------
-- products  (SRD §3)
--
-- KEY DECISION — tracking_mode.
-- SRD §4 says "every physical product should have a unique barcode", but §18B
-- separately asks for serial tracking on VR headsets/drones. Those pull in
-- opposite directions:
--
--   QUANTITY : 200 identical pen drives share ONE barcode. Scan once, type 20.
--   SERIAL   : each VR headset gets its OWN barcode + row in product_units.
--
-- We support both. The flag costs ~nothing now; retrofitting SERIAL later means
-- migrating history you no longer have. This is the single most expensive thing
-- to get wrong in this schema.
-- -----------------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  sku_barcode    text not null default app.next_product_barcode(),
  name           text not null,
  category_id    uuid references public.categories(id),
  brand_id       uuid references public.brands(id),
  uom_id         uuid references public.uoms(id),
  model_number   text,
  description    text,
  min_stock      integer not null default 0,   -- SRD §3 Minimum Stock Alert
  hsn_code       text,                         -- SRD §3 (optional)
  gst_percent    numeric(5,2),                 -- SRD §3 (optional)
  tracking_mode  tracking_mode not null default 'QUANTITY',
  is_kit         boolean not null default false,  -- SRD §18A
  is_active      boolean not null default true,

  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id),
  deleted_at     timestamptz,
  deleted_by     uuid references auth.users(id),
  version        integer not null default 1,

  constraint chk_products_name      check (length(trim(name)) > 0),
  constraint chk_products_min_stock check (min_stock >= 0),
  constraint chk_products_gst       check (gst_percent is null or (gst_percent >= 0 and gst_percent <= 100)),
  constraint chk_products_hsn       check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),

  -- A kit is assembled from components, so it can't also be serial-tracked today.
  constraint chk_products_kit_mode  check (not (is_kit and tracking_mode = 'SERIAL'))
);

create unique index uq_products_sku_live on public.products (sku_barcode) where deleted_at is null;

-- Access patterns from SRD §10 (Search) and §12 (Dashboard):
create index ix_products_category on public.products (category_id) where deleted_at is null;
create index ix_products_brand    on public.products (brand_id)    where deleted_at is null;
-- Trigram index: powers ILIKE '%ardu%' on product name. Without this, every
-- keystroke in the search box is a full table scan.
create index ix_products_name_trgm on public.products using gin (name gin_trgm_ops);

create trigger tg_products_audit before insert or update on public.products
  for each row execute function app.tg_set_audit();


-- -----------------------------------------------------------------------------
-- product_barcodes  (SRD §4 Option B — "User pastes manufacturer barcode")
--
-- Why a separate table instead of products.barcode text?
-- One product legitimately has MANY codes: our generated ST00000123 (SRD §4), the
-- manufacturer's EAN-13, an old label from a previous supplier. All must resolve
-- to the same product when scanned. That is 1:N -- it needs its own table.
--
-- The UNIQUE on `code` is the load-bearing constraint of the whole system: a
-- barcode that maps to two products makes every scan ambiguous.
-- -----------------------------------------------------------------------------
create table public.product_barcodes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  code        text not null,
  symbology   barcode_symbology not null default 'CODE128',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_barcode_code check (length(trim(code)) between 4 and 64),
  constraint uq_product_barcode_code unique (code)   -- global, no soft delete here
);

create index ix_product_barcodes_product on public.product_barcodes (product_id);
-- Exactly one primary barcode per product (the one we print by default).
create unique index uq_product_barcode_primary on public.product_barcodes (product_id) where is_primary;

create trigger tg_product_barcodes_audit before insert or update on public.product_barcodes
  for each row execute function app.tg_set_audit();


-- Give every new product a scannable code automatically.
create or replace function app.tg_seed_product_barcode() returns trigger
  language plpgsql security definer set search_path = public, app as
$$
begin
  insert into public.product_barcodes (product_id, code, symbology, is_primary)
  values (new.id, new.sku_barcode, 'CODE128', true);
  return new;
end;
$$;
create trigger tg_products_seed_barcode after insert on public.products
  for each row execute function app.tg_seed_product_barcode();


-- -----------------------------------------------------------------------------
-- product_units  (SRD §18B — Serial Number Tracking)
-- Rows exist ONLY for products with tracking_mode = 'SERIAL'.
-- This is what makes "which VR headset went to ABC School?" answerable.
-- -----------------------------------------------------------------------------
create table public.product_units (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id),
  serial_no         text,
  unit_barcode      text not null default app.next_unit_barcode(),
  status            unit_status not null default 'IN_STOCK',
  current_office_id uuid references public.offices(id),
  warranty_expires_at date,      -- SRD §15 "Warranty Tracking" — future-ready

  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id),
  deleted_at        timestamptz,
  deleted_by        uuid references auth.users(id),
  version           integer not null default 1,

  constraint uq_product_units_barcode unique (unit_barcode)
);

-- Serial numbers are unique per product, not globally: two different vendors
-- can legitimately both ship a unit stamped "001".
create unique index uq_product_units_serial on public.product_units (product_id, serial_no)
  where serial_no is not null and deleted_at is null;

create index ix_product_units_product on public.product_units (product_id);
create index ix_product_units_office  on public.product_units (current_office_id, status);

create trigger tg_product_units_audit before insert or update on public.product_units
  for each row execute function app.tg_set_audit();


-- Guard: a unit row is meaningless unless its product is SERIAL-tracked.
create or replace function app.tg_check_serial_mode() returns trigger
  language plpgsql security definer set search_path = public, app as
$$
begin
  if (select tracking_mode from public.products where id = new.product_id) <> 'SERIAL' then
    raise exception 'NOT_SERIAL_TRACKED: product % has tracking_mode QUANTITY; cannot create unit rows', new.product_id;
  end if;
  return new;
end;
$$;
create trigger tg_product_units_mode before insert on public.product_units
  for each row execute function app.tg_check_serial_mode();


-- -----------------------------------------------------------------------------
-- kit_components  (SRD §18A — Bill of Materials)
-- "1 AI Lab Kit = 1 Arduino + 1 Servo + 20 Jumper Wires"
-- Selling 1 kit deducts all components. See save_outward() in 05_rpc.sql.
-- -----------------------------------------------------------------------------
create table public.kit_components (
  id                   uuid primary key default gen_random_uuid(),
  kit_product_id       uuid not null references public.products(id) on delete cascade,
  component_product_id uuid not null references public.products(id),
  quantity             integer not null,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_kit_qty      check (quantity > 0),
  constraint chk_kit_not_self check (kit_product_id <> component_product_id),
  constraint uq_kit_component unique (kit_product_id, component_product_id)
);

create index ix_kit_components_kit on public.kit_components (kit_product_id);

create trigger tg_kit_components_audit before insert or update on public.kit_components
  for each row execute function app.tg_set_audit();

-- NOTE: single-level BOM only. A kit containing another kit would need a
-- recursive CTE to explode and cycle detection to stay safe. Not required by
-- the SRD -- don't build it until a real kit-of-kits shows up.


-- -----------------------------------------------------------------------------
-- pendrive_details  (SRD §18C — Pen Drive Content Tracking)
--
-- 1:1 extension of product_units. Kept separate rather than nullable columns on
-- product_units, because only pen drives have these fields and every other unit
-- row would carry 5 permanent NULLs.
-- Answers: "which content version did XYZ School actually receive?"
-- -----------------------------------------------------------------------------
create table public.pendrive_details (
  product_unit_id    uuid primary key references public.product_units(id) on delete cascade,
  capacity_gb        integer not null,
  content_version    text,             -- 'Std. 1-4 Marathi v2.3'
  content_loaded_at  timestamptz,
  loaded_by          uuid references auth.users(id),
  is_write_protected boolean not null default false,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_pendrive_capacity check (capacity_gb in (8, 16, 32, 64, 128, 256, 512, 1024))
);

create index ix_pendrive_version on public.pendrive_details (content_version);

create trigger tg_pendrive_audit before insert or update on public.pendrive_details
  for each row execute function app.tg_set_audit();

comment on column public.products.tracking_mode is
  'QUANTITY = fungible, one barcode for all units. SERIAL = one barcode per physical unit (product_units).';
comment on table public.product_barcodes is
  'Many codes -> one product. UNIQUE(code) is what makes every scan unambiguous.';
