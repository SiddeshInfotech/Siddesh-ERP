-- Migration 21: Movement deletion RPCs
-- Allows authenticated office users / admins to delete inward and outward movements,
-- cascading cleanly to stock ledger entries and items.

create or replace function public.delete_inward(p_inward_id uuid)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid;
begin
  select office_id into v_office_id from public.inwards where id = p_inward_id;
  if not found then
    raise exception 'INWARD_NOT_FOUND: inward entry % does not exist', p_inward_id using errcode = 'P0001';
  end if;

  if not app.can_access_office(v_office_id) then
    raise exception 'PERMISSION_DENIED: cannot delete inward from another office' using errcode = 'P0001';
  end if;

  delete from public.inwards where id = p_inward_id;
end;
$$;

create or replace function public.delete_outward(p_outward_id uuid)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid;
begin
  select office_id into v_office_id from public.outwards where id = p_outward_id;
  if not found then
    raise exception 'OUTWARD_NOT_FOUND: outward entry % does not exist', p_outward_id using errcode = 'P0001';
  end if;

  if not app.can_access_office(v_office_id) then
    raise exception 'PERMISSION_DENIED: cannot delete outward from another office' using errcode = 'P0001';
  end if;

  delete from public.outwards where id = p_outward_id;
end;
$$;

create or replace function public.delete_ledger_entry(p_ledger_id uuid)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid;
  v_inward_id uuid;
  v_outward_id uuid;
begin
  select office_id, inward_id, outward_id into v_office_id, v_inward_id, v_outward_id
    from public.stock_ledger where id = p_ledger_id;
  if not found then
    raise exception 'LEDGER_NOT_FOUND: ledger entry % does not exist', p_ledger_id using errcode = 'P0001';
  end if;

  if not app.can_access_office(v_office_id) then
    raise exception 'PERMISSION_DENIED: cannot delete ledger entry from another office' using errcode = 'P0001';
  end if;

  if v_inward_id is not null then
    delete from public.inwards where id = v_inward_id;
  elsif v_outward_id is not null then
    delete from public.outwards where id = v_outward_id;
  else
    delete from public.stock_ledger where id = p_ledger_id;
  end if;
end;
$$;

revoke all on function public.delete_inward(uuid)       from public, anon;
revoke all on function public.delete_outward(uuid)      from public, anon;
revoke all on function public.delete_ledger_entry(uuid) from public, anon;

grant execute on function public.delete_inward(uuid)       to authenticated, service_role;
grant execute on function public.delete_outward(uuid)      to authenticated, service_role;
grant execute on function public.delete_ledger_entry(uuid) to authenticated, service_role;
