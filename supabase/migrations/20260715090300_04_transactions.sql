-- =============================================================================
-- 04 — PARTIES & TRANSACTION DOCUMENTS  (SRD §5, §6; client chat §9)
-- suppliers, customers, inwards, outwards, transfers (+ items)
--
-- These tables record INTENT ("we sold 2 pen drives to XYZ School on invoice
-- INV-001"). They do NOT hold stock numbers -- that's stock_ledger's job.
-- Separating documents from the ledger is what keeps history correct when a
-- document is later corrected.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- suppliers  (SRD §5 step 4)
-- Normalised out of the inward document: the SRD lists supplier name/mobile/GST
-- inline on every inward, which would re-type "ABC Traders" 50 times with 50
-- chances to spell it differently, and make "supplier-wise report" (§11) a
-- string-matching exercise instead of a GROUP BY.
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  mobile      text,
  email       citext,
  gst_no      text,
  address     text,
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_suppliers_name   check (length(trim(name)) > 0),
  constraint chk_suppliers_mobile check (mobile is null or mobile ~ '^[0-9]{10}$'),
  constraint chk_suppliers_gst    check (gst_no is null or gst_no ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$')
);
create unique index uq_suppliers_name_live on public.suppliers (lower(name)) where deleted_at is null;
create index ix_suppliers_name_trgm on public.suppliers using gin (name gin_trgm_ops);
create trigger tg_suppliers_audit before insert or update on public.suppliers
  for each row execute function app.tg_set_audit();


-- -----------------------------------------------------------------------------
-- customers  (SRD §6 step 5 — "School Name"; SRD §18D — School Asset History)
-- Kept separate from suppliers rather than one polymorphic `parties` table:
-- SRD §15 lists "Vendor Management" and "School Management" as distinct future
-- modules, and the fields already diverge.
-- -----------------------------------------------------------------------------
create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,          -- School name
  contact_person text,
  mobile         text,
  email          citext,
  gst_no         text,
  address        text,
  city           text,
  is_active      boolean not null default true,

  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id),
  deleted_at     timestamptz,
  deleted_by     uuid references auth.users(id),
  version        integer not null default 1,

  constraint chk_customers_name   check (length(trim(name)) > 0),
  constraint chk_customers_mobile check (mobile is null or mobile ~ '^[0-9]{10}$'),
  constraint chk_customers_gst    check (gst_no is null or gst_no ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$')
);
create unique index uq_customers_name_live on public.customers (lower(name)) where deleted_at is null;
create index ix_customers_name_trgm on public.customers using gin (name gin_trgm_ops);
create trigger tg_customers_audit before insert or update on public.customers
  for each row execute function app.tg_set_audit();


-- =============================================================================
-- INWARD  (SRD §5)
-- Header + items. The SRD workflow is single-product, but header/items costs
-- nothing now and is the difference between "one invoice = one row" and "one
-- invoice = 12 disconnected rows" when a supplier ships 12 line items.
-- =============================================================================
create table public.inwards (
  id                  uuid primary key default gen_random_uuid(),
  inward_no           text not null,
  office_id           uuid not null references public.offices(id),
  supplier_id         uuid references public.suppliers(id),
  invoice_no          text,
  invoice_date        date,
  purchase_order_no   text,
  brought_by          text,          -- SRD §5 step 5: 'Atharva Birari' | 'Blue Dart' | 'DTDC'
  invoice_file_path   text,          -- SRD §5 step 6: Supabase Storage object path
  notes               text,
  received_at         timestamptz not null default now(),

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint uq_inwards_no check (length(trim(inward_no)) > 0)
);
create unique index uq_inwards_no_live on public.inwards (inward_no) where deleted_at is null;

-- SRD §11 Inward Report: date-wise, supplier-wise
create index ix_inwards_office_date on public.inwards (office_id, received_at desc);
create index ix_inwards_supplier    on public.inwards (supplier_id, received_at desc);
create index ix_inwards_invoice     on public.inwards (invoice_no) where invoice_no is not null;

create trigger tg_inwards_audit before insert or update on public.inwards
  for each row execute function app.tg_set_audit();


create table public.inward_items (
  id              uuid primary key default gen_random_uuid(),
  inward_id       uuid not null references public.inwards(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  product_unit_id uuid references public.product_units(id),   -- SERIAL products
  quantity        integer not null,
  unit_cost       numeric(12,2),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),
  version         integer not null default 1,

  constraint chk_inward_item_qty  check (quantity > 0),
  constraint chk_inward_item_cost check (unit_cost is null or unit_cost >= 0),
  -- A serial unit is exactly one physical thing. qty 5 with a unit_id is nonsense.
  constraint chk_inward_item_unit check (product_unit_id is null or quantity = 1)
);
create index ix_inward_items_inward  on public.inward_items (inward_id);
create index ix_inward_items_product on public.inward_items (product_id);
create trigger tg_inward_items_audit before insert or update on public.inward_items
  for each row execute function app.tg_set_audit();


-- =============================================================================
-- OUTWARD  (SRD §6)
-- =============================================================================
create table public.outwards (
  id                uuid primary key default gen_random_uuid(),
  outward_no        text not null,
  office_id         uuid not null references public.offices(id),
  customer_id       uuid references public.customers(id),
  outward_type      outward_type not null,
  invoice_no        text,
  sales_order_no    text,
  handed_over_by    text,        -- SRD §6 step 6
  received_by       text,        -- SRD §6 step 7 — who collected it
  signature_path    text,        -- SRD §6 step 8 — Storage path (signature/photo)
  notes             text,
  issued_at         timestamptz not null default now(),

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_outwards_no check (length(trim(outward_no)) > 0),
  -- A SALE without a customer is untraceable. Internal use legitimately has none.
  constraint chk_outwards_customer check (
    outward_type <> 'SALE' or customer_id is not null
  )
);
create unique index uq_outwards_no_live on public.outwards (outward_no) where deleted_at is null;

-- SRD §11 Outward Report: school-wise, invoice-wise, date-wise, executive-wise
create index ix_outwards_office_date on public.outwards (office_id, issued_at desc);
create index ix_outwards_customer    on public.outwards (customer_id, issued_at desc);
create index ix_outwards_invoice     on public.outwards (invoice_no) where invoice_no is not null;
create index ix_outwards_type_date   on public.outwards (outward_type, issued_at desc);
create index ix_outwards_creator     on public.outwards (created_by, issued_at desc);

create trigger tg_outwards_audit before insert or update on public.outwards
  for each row execute function app.tg_set_audit();


create table public.outward_items (
  id              uuid primary key default gen_random_uuid(),
  outward_id      uuid not null references public.outwards(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  product_unit_id uuid references public.product_units(id),
  quantity        integer not null,
  unit_price      numeric(12,2),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),
  version         integer not null default 1,

  constraint chk_outward_item_qty   check (quantity > 0),
  constraint chk_outward_item_price check (unit_price is null or unit_price >= 0),
  constraint chk_outward_item_unit  check (product_unit_id is null or quantity = 1)
);
create index ix_outward_items_outward on public.outward_items (outward_id);
create index ix_outward_items_product on public.outward_items (product_id);
create trigger tg_outward_items_audit before insert or update on public.outward_items
  for each row execute function app.tg_set_audit();


-- =============================================================================
-- TRANSFERS  (client chat §8/§9 — Office-to-Office)
--
-- TWO-STEP ON PURPOSE. Dispatch and receive are separate events:
--   DISPATCHED -> ledger TRANSFER_OUT (-5) at source, status IN_TRANSIT
--   RECEIVED   -> ledger TRANSFER_IN  (+5) at destination
--
-- A single atomic "move" would make stock in transit invisible. When a courier
-- loses a box, you need a record saying it left Pune and never reached Nashik.
-- =============================================================================
create table public.transfers (
  id             uuid primary key default gen_random_uuid(),
  transfer_no    text not null,
  from_office_id uuid not null references public.offices(id),
  to_office_id   uuid not null references public.offices(id),
  status         transfer_status not null default 'DRAFT',
  dispatched_at  timestamptz,
  dispatched_by  uuid references auth.users(id),
  received_at    timestamptz,
  received_by    uuid references auth.users(id),
  courier_name   text,
  docket_no      text,
  notes          text,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_transfer_no        check (length(trim(transfer_no)) > 0),
  constraint chk_transfer_offices   check (from_office_id <> to_office_id),
  -- Status and timestamps must agree. Prevents a RECEIVED transfer that was
  -- never dispatched.
  constraint chk_transfer_dispatch  check (
    (status in ('DRAFT', 'CANCELLED')) or dispatched_at is not null
  ),
  constraint chk_transfer_receive   check (
    (status <> 'RECEIVED') or (received_at is not null and dispatched_at is not null)
  )
);
create unique index uq_transfers_no_live on public.transfers (transfer_no) where deleted_at is null;
create index ix_transfers_from   on public.transfers (from_office_id, created_at desc);
create index ix_transfers_to     on public.transfers (to_office_id, status, created_at desc);
-- Partial index: "what's owed to me?" is the hot query on the dashboard.
create index ix_transfers_intransit on public.transfers (to_office_id) where status = 'DISPATCHED';

create trigger tg_transfers_audit before insert or update on public.transfers
  for each row execute function app.tg_set_audit();


create table public.transfer_items (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references public.transfers(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  product_unit_id uuid references public.product_units(id),
  quantity        integer not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),
  version         integer not null default 1,

  constraint chk_transfer_item_qty  check (quantity > 0),
  constraint chk_transfer_item_unit check (product_unit_id is null or quantity = 1)
);
create index ix_transfer_items_transfer on public.transfer_items (transfer_id);
create trigger tg_transfer_items_audit before insert or update on public.transfer_items
  for each row execute function app.tg_set_audit();

comment on table public.transfers is
  'Two-phase: DISPATCHED debits source, RECEIVED credits destination. Stock in transit is deliberately visible.';
