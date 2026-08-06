-- =============================================================================
-- 45 — OFFICE LOGINS (Dashboard-provisioned, app-linked)
--
-- Client decision (06/08/2026): each office gets its own login account — 4 office
-- ("general admin") logins + 1 global super-admin. The client asked for a password
-- column on `offices`; that is refused by design. Rule 0.1 + 02_org.sql: the .exe
-- ships the anon key publicly, so a credential in a client-readable table leaks every
-- office login. Credentials live ONLY in auth.users, which Supabase owns.
--
-- The compliant shape: an office login IS a Supabase Auth account, created in the
-- Supabase Dashboard (Authentication → Add user) with user-metadata:
--     { "full_name": "Dhule Branch Login",
--       "role": "STORE_MANAGER",
--       "office_id": "<offices.id>",
--       "is_office_login": true }
-- The tg_handle_new_user trigger (updated below) turns that metadata into a profile.
-- `is_office_login` keeps these accounts OUT of the User Management list, honouring
-- the client's "don't mix office logins into the users table".
--
-- No new credential storage. Data-only + trigger change; app surfaces it.
-- =============================================================================

-- 1. Flag office-login accounts -----------------------------------------------
alter table public.profiles
  add column if not exists is_office_login boolean not null default false;

comment on column public.profiles.is_office_login is
  'True for the shared login that represents an office (created in the Supabase '
  'Dashboard). Hidden from User Management; still fully attributes scans for audit.';

-- Fast per-office lookup of the login account(s). Partial: only live office logins.
create index if not exists ix_profiles_office_login
  on public.profiles (office_id)
  where is_office_login and deleted_at is null;

-- 2. Honour is_office_login on signup -----------------------------------------
-- Verbatim copy of 02_org.sql's trigger, with the one new column added. Every
-- existing behaviour (full_name fallback, ADMIN default, office_id, conflict guard)
-- is preserved; a signup with no is_office_login metadata reads false, exactly as
-- before this migration.
create or replace function app.tg_handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, app as
$$
begin
  insert into public.profiles (id, full_name, role, office_id, is_office_login)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((nullif(new.raw_user_meta_data->>'role', ''))::app_role, 'ADMIN'),
    (nullif(new.raw_user_meta_data->>'office_id', ''))::uuid,
    coalesce((new.raw_user_meta_data->>'is_office_login')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
