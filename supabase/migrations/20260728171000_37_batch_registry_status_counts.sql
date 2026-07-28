-- =============================================================================
-- 37 — HONEST BATCH-REGISTRY STATUS COUNTS
--
-- The barcode lifecycle vocabulary drifted across migrations. Migration 16
-- defined barcode_status as GENERATED / IN_STOCK / OUTWARD / VOID, and
-- v_batch_registry counts exactly those four. But migration 26 added a parallel
-- set (INWARDED, OUTWARDED, …) and save_inward now stamps received item barcodes
-- 'INWARDED'. Result: a received unit is neither GENERATED nor IN_STOCK, so it
-- fell out of every bucket — the registry showed 0 in-stock for stock that is
-- physically on the shelf, and total_barcodes no longer equalled the sum of the
-- status columns.
--
-- This reconciles the read side without touching the safety-critical write RPCs:
-- treat the two synonyms as one state each (received → in stock, issued → out).
-- =============================================================================

create or replace view public.v_batch_registry as
select
  bat.id                                                        as batch_id,
  bat.code                                                      as batch_code,
  bat.product_id,
  bat.created_at                                                as batch_created_at,
  bat.created_by                                                as batch_created_by,
  p.name                                                        as product_name,
  coalesce((select pb.code from public.product_barcodes pb where pb.product_id = p.id and pb.is_primary = true limit 1), p.product_code) as sku_barcode,
  p.category_id,
  c.name                                                        as category_name,
  br.name                                                       as brand_name,
  count(bc.id)                                                  as total_barcodes,
  count(bc.id) filter (where bc.status = 'GENERATED')                    as qty_generated,
  count(bc.id) filter (where bc.status in ('IN_STOCK', 'INWARDED'))      as qty_in_stock,
  count(bc.id) filter (where bc.status in ('OUTWARD', 'OUTWARDED'))      as qty_outward,
  count(bc.id) filter (where bc.status = 'VOID')                         as qty_void,
  min(bc.code)                                                  as first_barcode_code,
  coalesce((
    select sum(sb.qty_on_hand)
    from   public.stock_balances sb
    where  sb.product_id = p.id
  ), 0)                                                         as total_qty_on_hand
from      public.product_batches      bat
join      public.products             p   on p.id   = bat.product_id
left join public.categories           c   on c.id   = p.category_id
left join public.brands               br  on br.id  = p.brand_id
left join public.product_barcodes     bc  on bc.batch_id = bat.id
where p.deleted_at is null
group by
  bat.id,  bat.code,  bat.product_id,  bat.created_at,  bat.created_by,
  p.name,  p.id,  p.product_code,  p.category_id,
  c.name,  br.name;

grant select on public.v_batch_registry to authenticated;
grant select on public.v_batch_registry to service_role;

notify pgrst, 'reload schema';
