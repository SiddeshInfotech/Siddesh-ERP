-- =============================================================================
-- 60 — PER-OFFICE MOBILE LOGIN: office list readable pre-auth + robust office
--      assignment at signup
--
-- WHY
--   The mobile app assigns a new account to an office at registration. Two gaps made
--   every mobile account land with office_id = null (→ scan_mobile / scan_receive raise
--   NO_OFFICE):
--     1. Registration is PRE-AUTH, but `offices` was SELECT-able only by `authenticated`,
--        so the app could not load a real office list to pick from — it shipped hardcoded
--        names that didn't match the actual offices.
--     2. The signup trigger reads office_id from `raw_user_meta_data->>'office_id'`, but
--        the app sent only an `office` NAME string, so office_id was always null.
--
--   Fix, both non-destructive:
--     • Let `anon` read the office list (names/ids are not sensitive; passwords never
--       live here — see mig 45). Needed for the pre-login registration picker.
--     • Make the signup trigger resolve office_id from EITHER the office_id metadata OR
--       an office NAME (case-insensitive) — backward compatible with older app builds
--       that send only a name.
-- =============================================================================

-- 1. Anon may read the (non-deleted) office list, for the pre-auth registration picker.
--    Authenticated access is unchanged (offices_select from mig 07).
drop policy if exists offices_select_anon on public.offices;
create policy offices_select_anon on public.offices
  for select to anon
  using (deleted_at is null);

-- 2. Resolve office at signup from office_id OR office name. Verbatim copy of mig 45's
--    trigger with only the office_id resolution changed; every other behaviour
--    (full_name fallback, ADMIN default, is_office_login, conflict guard) is preserved.
create or replace function app.tg_handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid;
begin
  -- Prefer an explicit office_id; else map the office NAME the app sent to an id.
  v_office_id := coalesce(
    (nullif(new.raw_user_meta_data->>'office_id', ''))::uuid,
    (select o.id from public.offices o
      where o.deleted_at is null
        and lower(o.name) = lower(nullif(new.raw_user_meta_data->>'office', ''))
      limit 1)
  );

  insert into public.profiles (id, full_name, role, office_id, is_office_login)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((nullif(new.raw_user_meta_data->>'role', ''))::app_role, 'ADMIN'),
    v_office_id,
    coalesce((new.raw_user_meta_data->>'is_office_login')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
