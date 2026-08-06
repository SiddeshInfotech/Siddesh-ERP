-- =============================================================================
-- Migration 49: Fix views security invoker
--
-- Postgres views run as `security definer` (the view creator) by default. This
-- causes them to completely bypass Row Level Security on the underlying tables.
-- `v_current_stock` was fixed in a previous migration, but wrapping views like
-- `v_stock_dashboard` were not, which inadvertently stripped the RLS off 
-- `v_current_stock` again. This applies `security_invoker = on` to all public
-- views so RLS is properly enforced for all of them.
-- =============================================================================

alter view public.v_current_stock set (security_invoker = on);
alter view public.v_stock_dashboard set (security_invoker = on);
alter view public.v_product_ledger set (security_invoker = on);
alter view public.v_inward_history set (security_invoker = on);
alter view public.v_outward_history set (security_invoker = on);
alter view public.v_batch_registry set (security_invoker = on);
alter view public.v_batch_barcodes set (security_invoker = on);
alter view public.v_stock_balances_by_batch set (security_invoker = on);
alter view public.v_barcode_status_summary set (security_invoker = on);
alter view public.v_product_stock_status set (security_invoker = on);
alter view public.v_batch_activity set (security_invoker = on);

notify pgrst, 'reload schema';
