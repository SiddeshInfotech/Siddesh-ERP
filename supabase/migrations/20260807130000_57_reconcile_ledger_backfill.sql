-- =============================================================================
-- 57 — RECONCILE THE LEDGER WITH RECEIVED BARCODES  (fixes "33 in stock / 0 available")
--
-- ROOT CAUSE
--   Between mig 44 (20260806144123) and mig 51/56, scan_receive marked a barcode
--   INWARDED but did NOT post the ledger. So units received in that window have
--   product_barcodes.status = INWARDED (barcode truth) but ZERO INWARD rows in
--   stock_ledger, and v_current_stock.qty_available (derived from the ledger) reads 0
--   — so save_outward, holding the row lock, refuses the dispatch.
--
-- FIX (append-only, §0.3): for each (office, product, batch) compare the in-stock
--   barcode count to the current ledger balance and post ONE reversing ADJUSTMENT for
--   the gap via app.post_ledger (which moves stock_balances in the same transaction).
--   Idempotent — guarded by target<>current, so a re-run posts nothing.
--
-- NOTE: the scan_receive column fault (barcode_scans ref_context/ref_id) and the
--   who/when/where scan backfill are handled in migration 58, because this version's
--   number was already applied to remote before that logic was written.
-- =============================================================================

do $$
declare
  r          record;
  v_current  integer;
  v_delta    integer;
begin
  for r in
    select
      (select i.office_id from public.inward_items ii
         join public.inwards i on i.id = ii.inward_id
        where ii.batch_id = pb.batch_id order by i.received_at limit 1) as office_id,
      pb.product_id, pb.batch_id, count(*) as target_qty
    from public.product_barcodes pb
    where pb.status in ('INWARDED', 'AVAILABLE', 'IN_STOCK')
      and pb.batch_id is not null
    group by pb.product_id, pb.batch_id
  loop
    if r.office_id is null then
      continue;
    end if;

    select coalesce(sum(qty_delta), 0) into v_current
      from public.stock_ledger
     where office_id = r.office_id
       and product_id = r.product_id
       and batch_id is not distinct from r.batch_id;

    v_delta := r.target_qty - v_current;
    if v_delta <> 0 then
      perform app.post_ledger(
        p_client_txn_id := gen_random_uuid(),
        p_office_id := r.office_id, p_product_id := r.product_id, p_unit_id := null,
        p_txn_type := 'ADJUSTMENT', p_qty_delta := v_delta,
        p_ref_type := 'ADJUSTMENT', p_ref_id := null,
        p_notes := 'Backfill mig 57: reconcile ledger to received barcodes',
        p_batch_id := r.batch_id
      );
    end if;
  end loop;
end;
$$;

-- Deliberately NOT calling app.rebuild_stock_balances(): the live (mig 40) version
-- rebuilds from barcode COUNTS and omits AVAILABLE, which would undo this backfill.

notify pgrst, 'reload schema';
