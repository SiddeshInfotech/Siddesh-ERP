-- =============================================================================
-- Migration 23: Ensure Product Notes Table & Robust Delete All Inventory RPC
-- 1. Creates product_notes if missed during version collision repair.
-- 2. Makes delete_all_inventory_data dynamically check existing tables so it
--    never fails even if an optional or future table is absent.
-- =============================================================================

-- 1. Ensure product_notes table exists
create table if not exists public.product_notes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  note_text   text not null,
  
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  version     integer not null default 1,
  
  constraint chk_product_notes_text check (length(trim(note_text)) > 0)
);

create index if not exists ix_product_notes_product on public.product_notes (product_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'tg_product_notes_audit') then
    create trigger tg_product_notes_audit before insert or update on public.product_notes
      for each row execute function app.tg_set_audit();
  end if;
end $$;

alter table public.product_notes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'product_notes' and policyname = 'Admin all product_notes') then
    create policy "Admin all product_notes" on public.product_notes
      for all to authenticated
      using (app.is_admin())
      with check (app.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'product_notes' and policyname = 'Staff view product_notes') then
    create policy "Staff view product_notes" on public.product_notes
      for select to authenticated
      using (app.current_role() in ('STORE_MANAGER', 'SALES_EXECUTIVE'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'product_notes' and policyname = 'Staff insert product_notes') then
    create policy "Staff insert product_notes" on public.product_notes
      for insert to authenticated
      with check (app.current_role() in ('STORE_MANAGER', 'SALES_EXECUTIVE'));
  end if;
end $$;


-- 2. Robust delete_all_inventory_data RPC that dynamically truncates existing tables
create or replace function public.delete_all_inventory_data(p_confirm_code text)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_table text;
  v_tables text[] := array[
    'activity_logs',
    'barcode_scans',
    'stock_ledger',
    'stock_balances',
    'inward_items',
    'inwards',
    'outward_items',
    'outwards',
    'transfer_items',
    'transfers',
    'product_barcodes',
    'product_batches',
    'product_notes',
    'kit_components',
    'pendrive_details',
    'product_units',
    'products',
    'categories',
    'brands',
    'uoms',
    'suppliers',
    'customers'
  ];
  v_existing_tables text[] := array[]::text[];
begin
  if p_confirm_code <> 'DELETE-ALL-INVENTORY' then
    raise exception 'INVALID_CONFIRMATION: exact confirmation code required' using errcode = 'P0001';
  end if;

  if not app.is_admin() then
    raise exception 'PERMISSION_DENIED: only Admin can wipe inventory data' using errcode = 'P0001';
  end if;

  foreach v_table in array v_tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = v_table) then
      v_existing_tables := array_append(v_existing_tables, 'public.' || quote_ident(v_table));
    end if;
  end loop;

  if array_length(v_existing_tables, 1) > 0 then
    execute 'truncate table ' || array_to_string(v_existing_tables, ', ') || ' restart identity cascade;';
  end if;
end;
$$;

grant execute on function public.delete_all_inventory_data(text) to authenticated;
