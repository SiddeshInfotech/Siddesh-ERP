-- =============================================================================
-- 05 — STOCK LEDGER  (SRD §16; principles §16 "History Tables")
--
-- THE CORE OF THE SYSTEM. Read this file before changing anything else.
--
-- The SRD is explicit: "Stock Ledger / Every stock movement. Never delete.
-- Only append."
--
-- So we do NOT store `products.stock = 50`. We store every movement, and the
-- balance is the sum. Principles §16 says exactly this:
--     Instead of  Stock = 50
--     Maintain    +10 Purchase / -5 Sale / +20 Transfer / -2 Damage
--
-- WHY IT MATTERS: a mutable stock column loses history, races under concurrent
-- writes, and can never answer "how did we get to 13?". The ledger answers it
-- forever, and is the only defensible artefact in an audit or a stock dispute.
-- =============================================================================

create table public.stock_ledger (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),

  office_id       uuid not null references public.offices(id),
  product_id      uuid not null references public.products(id),
  product_unit_id uuid references public.product_units(id),

  txn_type        stock_txn_type not null,
  qty_delta       integer not null,       -- SIGNED: +20 inward, -2 outward
  balance_after   integer not null,       -- running balance for this (office, product)

  ref_type        doc_ref_type,           -- which document caused this
  ref_id          uuid,

  -- IDEMPOTENCY KEY. Generated on the device, once per form submission.
  -- The UNIQUE constraint below is the entire mechanism that stops a retried
  -- request on flaky office wifi from deducting stock twice. Without it, double
  -- deduction is silent and surfaces months later as a failed physical count.
  client_txn_id   uuid not null,

  notes           text,
  computer_name   text,                   -- SRD §14 (optional)
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),

  -- NOTE the absence of updated_at / updated_by / deleted_at / version.
  -- That is deliberate and is the point of an append-only table. A ledger row is
  -- a historical fact; facts do not get edited. Corrections are new reversing
  -- rows (txn_type = 'ADJUSTMENT'), which is also what the auditor wants to see.

  constraint uq_stock_ledger_client_txn unique (client_txn_id),

  constraint chk_ledger_delta_nonzero check (qty_delta <> 0),
  constraint chk_ledger_balance_sane  check (balance_after >= 0),

  -- Sign must match intent. Stops an "INWARD" that secretly reduces stock --
  -- a class of bug that is invisible in reports until the count is wrong.
  constraint chk_ledger_delta_sign check (
    (txn_type in ('OPENING', 'INWARD', 'TRANSFER_IN')  and qty_delta > 0) or
    (txn_type in ('OUTWARD', 'TRANSFER_OUT')           and qty_delta < 0) or
    (txn_type = 'ADJUSTMENT')                      -- may go either way
  ),

  -- A serial unit movement is always exactly one physical item.
  constraint chk_ledger_unit_qty check (
    product_unit_id is null or abs(qty_delta) = 1
  )
);

-- --- Indexes: driven by real access patterns, not guesswork ------------------

-- SRD §11 "Product Ledger — shows complete history" + §18E "Stock Movement
-- Timeline". This is the hot path for the product detail screen.
create index ix_ledger_product_office_time
  on public.stock_ledger (product_id, office_id, occurred_at desc);

-- Office-wide activity feed / dashboard (SRD §12: Today's Inward, Today's Outward)
create index ix_ledger_office_time
  on public.stock_ledger (office_id, occurred_at desc);

-- Drill down from a document to its stock effect
create index ix_ledger_ref
  on public.stock_ledger (ref_type, ref_id);

-- Serial history: "where has this VR headset been?" (SRD §18B, §18D)
create index ix_ledger_unit
  on public.stock_ledger (product_unit_id, occurred_at desc)
  where product_unit_id is not null;

-- Reports by movement type (SRD §11)
create index ix_ledger_type_time
  on public.stock_ledger (txn_type, occurred_at desc);


-- --- Enforce append-only in the database, not in convention ------------------
-- Application discipline is not a constraint. This trigger makes UPDATE/DELETE
-- physically impossible, including from a bad migration or a stray query in the
-- Supabase SQL editor running as service_role.
create trigger tg_ledger_append_only
  before update or delete on public.stock_ledger
  for each row execute function app.tg_block_mutation();


-- =============================================================================
-- stock_balances  (SRD §7 — Current Stock)
--
-- A CACHE. The ledger is the truth. This table exists so the dashboard doesn't
-- SUM() the whole ledger on every page load.
--
-- It is updated inside the same transaction as the ledger insert, under
-- SELECT ... FOR UPDATE. If it ever drifts, throw it away and rebuild it from
-- the ledger with app.rebuild_stock_balances().
-- =============================================================================
create table public.stock_balances (
  office_id     uuid not null references public.offices(id),
  product_id    uuid not null references public.products(id),

  qty_on_hand   integer not null default 0,
  qty_reserved  integer not null default 0,   -- SRD §7 "Reserved Stock (future)"

  -- SRD §7 "Available Stock". Generated column: cannot drift from its inputs,
  -- because Postgres computes it. One less thing to keep in sync.
  qty_available integer generated always as (qty_on_hand - qty_reserved) stored,

  updated_at    timestamptz not null default now(),

  primary key (office_id, product_id),

  constraint chk_balance_on_hand  check (qty_on_hand  >= 0),
  constraint chk_balance_reserved check (qty_reserved >= 0),
  constraint chk_balance_reserve_le_hand check (qty_reserved <= qty_on_hand)
);

-- Dashboard: office stock list sorted by product
create index ix_balances_office on public.stock_balances (office_id);
-- "Which products exist across offices?" (Admin view)
create index ix_balances_product on public.stock_balances (product_id);
-- SRD §11 "Low Stock" / "Out of Stock" reports. Partial index -- only rows that
-- can possibly be low are indexed, so the index stays tiny.
create index ix_balances_low_stock on public.stock_balances (office_id, product_id)
  where qty_on_hand = 0;


-- =============================================================================
-- REBUILD — the safety net that makes the cache-vs-truth split honest
-- Run after any suspected drift. Should always be a no-op; if it isn't, the
-- RPCs have a bug.
-- =============================================================================
create or replace function app.rebuild_stock_balances() returns integer
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_rows integer;
begin
  -- Reserved is not derivable from the ledger, so preserve it.
  create temp table _reserved on commit drop as
    select office_id, product_id, qty_reserved from public.stock_balances;

  delete from public.stock_balances;

  insert into public.stock_balances (office_id, product_id, qty_on_hand, qty_reserved, updated_at)
  select
    l.office_id,
    l.product_id,
    sum(l.qty_delta)::integer,
    coalesce(r.qty_reserved, 0),
    now()
  from public.stock_ledger l
  left join _reserved r
    on r.office_id = l.office_id and r.product_id = l.product_id
  group by l.office_id, l.product_id, r.qty_reserved
  having sum(l.qty_delta) <> 0 or coalesce(r.qty_reserved, 0) <> 0;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;


-- =============================================================================
-- VIEWS for reporting (SRD §7, §11, §12)
-- Plain views, not materialised: at this data volume they're instant, and a
-- materialised view would need refresh scheduling -- complexity with no payoff.
-- =============================================================================

-- SRD §7 — Current Stock dashboard
create or replace view public.v_current_stock as
select
  b.office_id,
  o.name  as office_name,
  b.product_id,
  p.sku_barcode,
  p.name  as product_name,
  c.name  as category_name,
  br.name as brand_name,
  u.code  as uom_code,
  b.qty_on_hand,
  b.qty_reserved,
  b.qty_available,
  p.min_stock,
  (b.qty_available <= p.min_stock) as is_low_stock,
  b.updated_at
from public.stock_balances b
join public.products  p  on p.id  = b.product_id
join public.offices   o  on o.id  = b.office_id
left join public.categories c on c.id = p.category_id
left join public.brands     br on br.id = p.brand_id
left join public.uoms       u  on u.id  = p.uom_id
where p.deleted_at is null;

-- SRD §11 — Product Ledger ("01 Jan / Inward / +20 / Supplier ABC")
create or replace view public.v_product_ledger as
select
  l.id,
  l.occurred_at,
  l.office_id,
  o.name as office_name,
  l.product_id,
  p.name as product_name,
  p.sku_barcode,
  l.txn_type,
  l.qty_delta,
  l.balance_after,
  l.ref_type,
  l.ref_id,
  coalesce(s.name, cu.name) as party_name,
  pr.full_name as created_by_name,
  l.notes
from public.stock_ledger l
join public.products p on p.id = l.product_id
join public.offices  o on o.id = l.office_id
left join public.profiles pr on pr.id = l.created_by
left join public.inwards  i  on l.ref_type = 'INWARD'  and i.id = l.ref_id
left join public.suppliers s on s.id = i.supplier_id
left join public.outwards ow on l.ref_type = 'OUTWARD' and ow.id = l.ref_id
left join public.customers cu on cu.id = ow.customer_id;

comment on table public.stock_ledger is
  'APPEND-ONLY source of truth for all stock. Never UPDATE/DELETE -- post reversing ADJUSTMENT rows. SRD §16.';
comment on table public.stock_balances is
  'Derived cache of stock_ledger. Rebuildable via app.rebuild_stock_balances(). The ledger is authoritative.';
comment on column public.stock_ledger.client_txn_id is
  'Device-generated UUID, one per form submission (NOT per retry). UNIQUE -> retry-safe writes.';
