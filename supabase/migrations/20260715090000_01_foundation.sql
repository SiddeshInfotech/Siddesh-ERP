-- =============================================================================
-- 01 — FOUNDATION
-- Extensions, enums, sequences, helper functions, audit + guard triggers.
-- Nothing here creates business tables; everything below depends on this file.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy product-name search (SRD §10)
create extension if not exists citext;     -- case-insensitive text

-- Private schema for internal helpers.
-- NOT exposed via PostgREST -> clients can never call these directly.
create schema if not exists app;
revoke all on schema app from anon, authenticated;


-- =============================================================================
-- ENUMS
-- Enums over lookup tables where the set is small, stable, and code branches on
-- it. Adding a value is `alter type ... add value` -- cheap. Categories/brands
-- stay as tables because users create them at runtime.
-- =============================================================================

-- SRD §2 — "Initially only one Admin login. Later support Admin / Store Manager /
-- Sales Executive." These are the SRD's three roles verbatim.
--
-- Mapping onto the three-office deployment:
--   ADMIN           — the SRD's Admin. Global: sees and acts across all offices.
--   STORE_MANAGER   — runs one office's stock.
--   SALES_EXECUTIVE — works in one office. SRD §11 groups the outward report by this.
create type app_role           as enum ('ADMIN', 'STORE_MANAGER', 'SALES_EXECUTIVE');
create type tracking_mode      as enum ('QUANTITY', 'SERIAL');
create type barcode_symbology  as enum ('CODE128', 'EAN13', 'UPCA', 'QR', 'OTHER');
create type unit_status        as enum ('IN_STOCK', 'ISSUED', 'IN_TRANSIT', 'RMA', 'SCRAPPED');
create type transfer_status    as enum ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED');
create type doc_ref_type       as enum ('INWARD', 'OUTWARD', 'TRANSFER', 'ADJUSTMENT');

-- SRD §6 step 4
create type outward_type       as enum ('SALE', 'DEMO', 'REPLACEMENT', 'INTERNAL_USE', 'SERVICE', 'SAMPLE');

-- Every row in stock_ledger is one of these. OPENING is for go-live balances.
create type stock_txn_type     as enum ('OPENING', 'INWARD', 'OUTWARD', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');


-- =============================================================================
-- SEQUENCES — human-readable document numbers
-- Sequences are gap-tolerant by design (a rolled-back txn burns a number).
-- That is correct and intentional: gaps are fine, duplicates are not.
-- =============================================================================

-- ONE sequence for every physical barcode, deliberately.
--
-- SRD §4 and §9 both specify a single flat format — `ST00000001`, `ST00012345` — with
-- no product/unit prefix. That leaves SKU-level and unit-level codes sharing one
-- namespace, so they MUST draw from the same counter: two sequences would both emit
-- ST00000001 and a scan of it would be ambiguous. SRD §4: "Every physical product
-- should have a unique barcode."
create sequence app.barcode_seq         start 1;
create sequence app.inward_no_seq       start 1;
create sequence app.outward_no_seq      start 1;
create sequence app.transfer_no_seq     start 1;

-- SRD §4 Option A: software-generated barcode. Format is `ST` + 8 zero-padded digits,
-- exactly as the SRD's own examples show (§4: ST00000001 / §9: ST00012345).
--
-- SECURITY DEFINER is required, not decorative. These are column defaults:
--   products.sku_barcode     default app.next_product_barcode()   (03_products.sql)
--   product_units.unit_barcode default app.next_unit_barcode()    (03_products.sql)
-- A column default is evaluated as the *inserting* user, and products_write (07_rls.sql)
-- lets an ADMIN / STORE_MANAGER insert directly. Without DEFINER that user would need
-- USAGE on app.barcode_seq granted straight to `authenticated` — handing every client
-- the raw counter. DEFINER runs the function as its owner instead, so the sequence stays
-- private and this function is the only gate to it.
create or replace function app.next_product_barcode() returns text
  language sql volatile security definer set search_path = public, app as
$$ select 'ST' || lpad(nextval('app.barcode_seq')::text, 8, '0') $$;

-- SRD §18B: "Each serial number can have its own barcode." The SRD gives no separate
-- format for these, so they use the same one and the same counter — which is what keeps
-- them from colliding with SKU codes.
create or replace function app.next_unit_barcode() returns text
  language sql volatile security definer set search_path = public, app as
$$ select 'ST' || lpad(nextval('app.barcode_seq')::text, 8, '0') $$;

create or replace function app.next_doc_no(p_prefix text, p_seq regclass) returns text
  language sql volatile as
$$ select p_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval(p_seq)::text, 5, '0') $$;


-- =============================================================================
-- SCHEMA-LEVEL GRANTS
--
-- SUBTLE BUT LOAD-BEARING. RLS policies in 07_rls.sql call app.is_admin() etc.
-- A policy predicate is evaluated as the *querying* role, not the table owner --
-- so `authenticated` needs USAGE on schema `app` and EXECUTE on those helpers.
-- Without it every policy fails with "permission denied for schema app" and the
-- whole app appears broken with a misleading error.
--
-- Granting USAGE does NOT expose anything over HTTP: PostgREST only publishes
-- schemas listed in Supabase's API settings (public), so `app` stays unreachable
-- from the .exe and the APK regardless.
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, so revoke it
-- as the default here and whitelist each function individually where it is defined.
-- This ALTER DEFAULT PRIVILEGES is stored permanently, so it also governs the
-- helpers created in 02_org.sql and the RPCs in 06_rpc.sql.
--
-- The identity helpers themselves (current_office_id, current_role, is_admin,
-- can_access_office) are NOT here -- they live in 02_org.sql, immediately after the
-- profiles table they read. `language sql` bodies are parsed and validated at CREATE
-- time, so defining them before profiles exists fails with
-- `relation "public.profiles" does not exist`. Only plpgsql defers that check.
-- =============================================================================

grant usage on schema app to authenticated;

alter default privileges in schema app revoke execute on functions from public;
revoke execute on all functions in schema app from public, anon;

-- The barcode generators ARE called by `authenticated`, because they are column
-- defaults on products / product_units and a default runs as the inserting user.
-- Without these two grants, "Add Product" fails with:
--     permission denied for function next_product_barcode
-- They are SECURITY DEFINER (see above), so granting EXECUTE does not expose the
-- underlying sequence.
grant execute on function app.next_product_barcode() to authenticated;
grant execute on function app.next_unit_barcode()    to authenticated;


-- =============================================================================
-- AUDIT TRIGGER  (SRD §14 — Created By / Created Date / Updated By / Updated Date)
--
-- Applied to every master + document table. Never trust the client to send
-- created_by; the DB stamps it from the JWT.
-- =============================================================================

create or replace function app.tg_set_audit() returns trigger
  language plpgsql security definer set search_path = public, app as
$$
begin
  if (tg_op = 'INSERT') then
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := auth.uid();
    new.version    := 1;
  elsif (tg_op = 'UPDATE') then
    -- Preserve creation facts even if the client echoes them back changed.
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
    new.version    := old.version + 1;   -- optimistic-locking counter
  end if;
  return new;
end;
$$;


-- =============================================================================
-- APPEND-ONLY GUARD  (SRD §16 — "Every stock movement. Never delete. Only append.")
--
-- Convention is not enforcement. This trigger makes UPDATE/DELETE on the ledger
-- physically impossible -- including from a buggy migration or a mistaken
-- service_role query in the SQL editor. Corrections are reversing entries.
-- =============================================================================

create or replace function app.tg_block_mutation() returns trigger
  language plpgsql as
$$
begin
  raise exception 'APPEND_ONLY: % on % is not permitted. Post a reversing ADJUSTMENT entry instead.',
    tg_op, tg_table_name;
end;
$$;

comment on schema app is
  'Internal helpers. Not exposed via PostgREST. Clients call public RPCs only.';
