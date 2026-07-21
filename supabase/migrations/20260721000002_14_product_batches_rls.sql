-- =============================================================================
-- 14 — ROW LEVEL SECURITY FOR product_batches
--
-- product_batches was created in migration 12, AFTER 07_rls.sql had already
-- enabled RLS + written policies for every other table. It was never added to
-- that list, so it shipped with no client-readable policy.
--
-- The effect: v_inward_history reads product_batches through the view owner's
-- privileges, so the batch CODE renders in the Inwards table — but the client
-- cannot query product_batches directly. So BatchBarcodesModal (which resolves
-- batch_code -> batch_id against this table) got zero rows and showed an empty
-- "Batch Records" list. useBatches (the BatchPicker's existing-batch list) hit
-- the same wall.
--
-- Batches are product-level, not office-level, and a batch code is globally
-- unique — so SELECT mirrors product_barcodes: readable by any authenticated
-- user (scanning and lookup need it). Writes stay with ADMIN / STORE_MANAGER;
-- the actual inserts happen inside save_inward (SECURITY DEFINER, owner bypass),
-- this policy just makes the intent explicit and matches every other table.
-- =============================================================================

alter table public.product_batches enable row level security;

-- Guarded so a later `supabase db push` cannot fail on "policy already exists":
-- this policy was first applied out-of-band (the pinned CLI binary is a stub, so
-- `db push` could not run — see CLAUDE.md), and this migration must re-run cleanly.
drop policy if exists product_batches_select on public.product_batches;
create policy product_batches_select on public.product_batches
  for select to authenticated using (true);

drop policy if exists product_batches_write on public.product_batches;
create policy product_batches_write on public.product_batches
  for all to authenticated
  using (app.current_role() in ('ADMIN','STORE_MANAGER'))
  with check (app.current_role() in ('ADMIN','STORE_MANAGER'));

notify pgrst, 'reload schema';
