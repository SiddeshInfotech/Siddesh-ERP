-- =============================================================================
-- 02 — ORGANISATION & IDENTITY
-- offices, profiles, activity_logs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- offices  (client chat §8 — Multi-Office Support; SRD §15 "Multi Branch")
-- -----------------------------------------------------------------------------
create table public.offices (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  address     text,
  city        text,
  state       text,
  gst_no      text,
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_offices_code   check (code ~ '^[A-Z0-9_]{2,10}$'),
  constraint chk_offices_name   check (length(trim(name)) > 0),
  constraint chk_offices_gst    check (gst_no is null or gst_no ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$')
);

-- Soft delete + UNIQUE do not mix. A plain UNIQUE(code) would reject reusing
-- 'PUNE' after the old Pune office is soft-deleted. Partial index fixes it:
-- uniqueness applies only among live rows. Same pattern on every soft-deleted
-- table below.
create unique index uq_offices_code_live on public.offices (code) where deleted_at is null;

create trigger tg_offices_audit before insert or update on public.offices
  for each row execute function app.tg_set_audit();


-- -----------------------------------------------------------------------------
-- profiles  (SRD §2 — Admin / Store Manager / Sales Executive)
--
-- Mirrors auth.users 1:1. Supabase owns auth.users (password hashes, MFA, etc.)
-- and we never touch it -- SRD §14's "never store plain passwords" is satisfied
-- by simply not having a password column at all.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  mobile      text,
  role        app_role not null default 'SALES_EXECUTIVE',
  office_id   uuid references public.offices(id),
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  version     integer not null default 1,

  constraint chk_profiles_name   check (length(trim(full_name)) > 0),
  constraint chk_profiles_mobile check (mobile is null or mobile ~ '^[0-9]{10}$'),

  -- An Admin is global (office_id null). Everyone else MUST be pinned to an
  -- office, because RLS scopes their data by it. A non-Admin row with a null office
  -- would silently see nothing -- or, if a policy is sloppy, everything.
  constraint chk_profiles_office check (
    (role = 'ADMIN') or (office_id is not null)
  )
);

create index ix_profiles_office on public.profiles (office_id) where deleted_at is null;

create trigger tg_profiles_audit before insert or update on public.profiles
  for each row execute function app.tg_set_audit();


-- =============================================================================
-- IDENTITY HELPERS
--
-- These live HERE, not in 01_foundation, because they read public.profiles and a
-- `language sql` body is parsed and validated at CREATE time. Defining them before
-- the table exists fails outright:
--     ERROR: relation "public.profiles" does not exist
-- (plpgsql defers that check; sql does not.) A function that reads profiles belongs
-- after profiles.
--
-- CRITICAL: these are SECURITY DEFINER on purpose.
-- RLS policies on `profiles` need to read `profiles` to find your office. A plain
-- query inside such a policy re-triggers the policy -> infinite recursion -> every
-- query fails with a stack-depth error. SECURITY DEFINER bypasses RLS inside the
-- function, breaking the cycle. This is THE most common way a Supabase RLS setup
-- breaks.
--
-- STABLE (not VOLATILE) so Postgres calls them once per statement, not once per row
-- -- a policy on a 50k-row scan would otherwise do 50k lookups.
-- =============================================================================

create or replace function app.current_office_id() returns uuid
  language sql stable security definer set search_path = public, app as
$$ select office_id from public.profiles where id = auth.uid() $$;

create or replace function app.current_role() returns app_role
  language sql stable security definer set search_path = public, app as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = public, app as
$$ select coalesce((select role = 'ADMIN' from public.profiles where id = auth.uid()), false) $$;

-- Can the current user act on this office's data?
-- Admin sees all offices (SRD §2); everyone else sees only their own.
create or replace function app.can_access_office(p_office_id uuid) returns boolean
  language sql stable security definer set search_path = public, app as
$$ select app.is_admin() or p_office_id = app.current_office_id() $$;

-- `authenticated` must be able to EXECUTE these: 07_rls.sql's policies call them, and
-- a policy predicate runs as the querying role. 01_foundation revoked EXECUTE from
-- PUBLIC by default for this schema, so each one is whitelisted explicitly.
grant execute on function app.current_office_id()     to authenticated;
grant execute on function app.current_role()          to authenticated;
grant execute on function app.is_admin()              to authenticated;
grant execute on function app.can_access_office(uuid) to authenticated;


-- Auto-create a profile whenever Supabase Auth creates a user.
-- Without this, a new user logs in successfully but has no role and no office,
-- so every RLS policy denies them and the app looks broken with no error.
--
-- The default role is ADMIN, straight from SRD §2: "Initially only one Admin login."
--
-- It is also what makes creating the first user possible at all. Defaulting to any
-- other role, with no office_id in the signup metadata, violates chk_profiles_office
-- above -- which fails the INSERT, which fails the auth.users insert, so the user
-- cannot be created and the dashboard reports an opaque database error.
--
-- ⚠️ THIS ASSUMES PUBLIC SIGNUP IS DISABLED.
-- Supabase Dashboard -> Authentication -> Providers -> Email -> "Allow new users to
-- sign up" = OFF. With it on, anyone who self-registers becomes an Admin over all
-- three offices. Per SRD §2 the Admin creates every other user, so signup must stay
-- closed. Re-check this setting before go-live.
create or replace function app.tg_handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, app as
$$
begin
  insert into public.profiles (id, full_name, role, office_id)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((nullif(new.raw_user_meta_data->>'role', ''))::app_role, 'ADMIN'),
    (nullif(new.raw_user_meta_data->>'office_id', ''))::uuid
  )
  -- Never let a re-created trigger or a backfill break signup.
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger tg_on_auth_user_created
  after insert on auth.users
  for each row execute function app.tg_handle_new_user();


-- -----------------------------------------------------------------------------
-- activity_logs  (principles §17 — Event Logs)
--
-- One table, jsonb payload -- NOT a per-table shadow history table. At this
-- volume, jsonb + a GIN index answers "who changed what" without doubling the
-- schema. Revisit only if audit queries become a real workload.
--
-- Append-only, same as the ledger.
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid references auth.users(id),
  office_id     uuid references public.offices(id),
  action        text not null,          -- 'LOGIN' | 'PRODUCT_UPDATE' | 'STOCK_ADJUST' ...
  entity_type   text,                   -- 'products' | 'stock_ledger' ...
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  ip_address    inet,
  computer_name text,                   -- SRD §14 "Computer Name (optional)"
  created_at    timestamptz not null default now(),

  constraint chk_activity_action check (length(trim(action)) > 0)
);

-- bigint identity, not uuid: this table is append-heavy and never joined by id
-- from a client. Sequential ints keep the index dense and the table small.

create index ix_activity_created  on public.activity_logs (created_at desc);
create index ix_activity_actor    on public.activity_logs (actor_id, created_at desc);
create index ix_activity_entity   on public.activity_logs (entity_type, entity_id);
create index ix_activity_after    on public.activity_logs using gin (after_data);

create trigger tg_activity_no_update before update or delete on public.activity_logs
  for each row execute function app.tg_block_mutation();

comment on table public.profiles is
  'Business identity. auth.users holds credentials; this holds role + office.';
comment on column public.profiles.version is
  'Optimistic locking counter, bumped by tg_set_audit on every UPDATE.';
