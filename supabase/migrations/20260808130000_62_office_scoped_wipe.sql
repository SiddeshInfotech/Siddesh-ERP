-- =============================================================================
-- Migration 62: Office-scoped inventory wipe
--
-- Before: delete_all_inventory_data TRUNCATEd every table for ALL offices, gated
-- to Admin only. Now that migration 54 siloed every table by office_id, the wipe
-- respects the login:
--   * ADMIN (global, no office)  -> full reset of every office (TRUNCATE, resets
--     sequences) — unchanged behaviour.
--   * STORE_MANAGER (own office) -> deletes only rows where office_id = the caller's
--     office. Other offices are untouched; global sequences are intentionally NOT
--     reset so other branches keep their document numbering.
-- Any other role is denied.
--
-- NOTE: this deliberately deletes stock_ledger rows. The append-only rule (§0.3)
-- governs normal operation; this is the admin/manager reset escape hatch, run as a
-- security-definer function behind an explicit confirmation code.
-- =============================================================================

create or replace function public.delete_all_inventory_data(p_confirm_code text)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_table     text;
  v_office_id uuid := app.current_office_id();
  -- Children before parents, so plain DELETEs never trip a RESTRICT foreign key.
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
  v_existing text[] := array[]::text[];
begin
  if p_confirm_code <> 'DELETE-ALL-INVENTORY' then
    raise exception 'INVALID_CONFIRMATION: exact confirmation code required' using errcode = 'P0001';
  end if;

  -- ADMIN: global reset of every office. TRUNCATE ... RESTART IDENTITY also resets sequences.
  if app.is_admin() then
    foreach v_table in array v_tables loop
      if exists (
        select 1 from information_schema.tables
         where table_schema = 'public' and table_name = v_table
      ) then
        v_existing := array_append(v_existing, 'public.' || quote_ident(v_table));
      end if;
    end loop;

    if array_length(v_existing, 1) > 0 then
      execute 'truncate table ' || array_to_string(v_existing, ', ') || ' restart identity cascade;';
    end if;
    return;
  end if;

  -- STORE_MANAGER: office-scoped reset of the caller's OWN office only.
  if app.current_role() <> 'STORE_MANAGER' or v_office_id is null then
    raise exception 'PERMISSION_DENIED: only an Admin (all offices) or a Store Manager (own office) can wipe inventory'
      using errcode = 'P0001';
  end if;

  -- stock_ledger and activity_logs are append-only (block-mutation triggers). A full office
  -- reset must clear them too — Admin's TRUNCATE path bypasses row triggers, and this DELETE
  -- path must as well, or the products delete fails on the ledger's foreign key. Disable the
  -- two guards for THIS TRANSACTION only: ALTER TABLE is transactional, so any failure below
  -- rolls the disable back with the deletes, and the explicit re-enable restores them on success.
  alter table public.stock_ledger  disable trigger tg_ledger_append_only;
  alter table public.activity_logs disable trigger tg_activity_no_update;

  -- Every table carries office_id (migration 54), so each delete is strictly limited to this
  -- office. office_id is bound as a parameter ($1), never string-concatenated.
  foreach v_table in array v_tables loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_table and column_name = 'office_id'
    ) then
      execute format('delete from public.%I where office_id = $1', v_table) using v_office_id;
    end if;
  end loop;

  alter table public.stock_ledger  enable trigger tg_ledger_append_only;
  alter table public.activity_logs enable trigger tg_activity_no_update;
end;
$$;

grant execute on function public.delete_all_inventory_data(text) to authenticated;

notify pgrst, 'reload schema';
