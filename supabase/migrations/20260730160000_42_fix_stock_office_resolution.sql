-- =============================================================================
-- 42 — FIX STOCK OFFICE RESOLUTION FOR UN-SCANNED INWARDED BARCODES
-- =============================================================================

-- Redefine v_stock_balances_by_batch view to resolve office_id from inward documents
-- if no scan history exists for the barcode.
create or replace view public.v_stock_balances_by_batch as
with barcoded_balances as (
  select 
    coalesce(
      (
        select office_id from public.barcode_scans s 
         where s.barcode_id = pb.id 
         order by s.scanned_at desc limit 1
      ),
      (
        select i.office_id from public.inward_items ii 
          join public.inwards i on i.id = ii.inward_id 
         where ii.batch_id = pb.batch_id 
         limit 1
      )
    ) as office_id,
    pb.product_id,
    pb.batch_id,
    count(*)::bigint as qty_on_hand
  from public.product_barcodes pb
  where pb.status in ('IN_STOCK', 'INWARDED')
  group by 1, pb.product_id, pb.batch_id
),
ledger_balances as (
  select 
    l.office_id,
    l.product_id,
    l.batch_id,
    sum(l.qty_delta)::bigint as qty_on_hand
  from public.stock_ledger l
  where not exists (
    select 1 from public.product_barcodes pb 
     where pb.product_id = l.product_id
  )
  group by l.office_id, l.product_id, l.batch_id
)
select office_id, product_id, batch_id, qty_on_hand from barcoded_balances where office_id is not null
union all
select office_id, product_id, batch_id, qty_on_hand from ledger_balances;

notify pgrst, 'reload schema';
