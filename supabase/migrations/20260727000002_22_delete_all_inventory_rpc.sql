-- =============================================================================
-- Migration 22: Delete All Inventory Data RPC
-- Allows Admin users to permanently wipe all inventory system data, resetting all
-- sequence counters back to 0 so not a single character remains in inventory tables.
-- =============================================================================

create or replace function public.delete_all_inventory_data(p_confirm_code text)
returns void
language plpgsql security definer set search_path = public, app as
$$
begin
  if p_confirm_code <> 'DELETE-ALL-INVENTORY' then
    raise exception 'INVALID_CONFIRMATION: exact confirmation code required' using errcode = 'P0001';
  end if;

  if not app.is_admin() then
    raise exception 'PERMISSION_DENIED: only Admin can wipe inventory data' using errcode = 'P0001';
  end if;

  truncate table
    public.activity_logs,
    public.barcode_scans,
    public.stock_ledger,
    public.stock_balances,
    public.inward_items,
    public.inwards,
    public.outward_items,
    public.outwards,
    public.transfer_items,
    public.transfers,
    public.product_barcodes,
    public.product_batches,
    public.product_notes,
    public.kit_components,
    public.pendrive_details,
    public.product_units,
    public.products,
    public.categories,
    public.brands,
    public.uoms,
    public.suppliers,
    public.customers
  restart identity cascade;
end;
$$;

grant execute on function public.delete_all_inventory_data(text) to authenticated;
