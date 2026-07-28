-- =============================================================================
-- 38 — OUTWARD KEEPS ITEM-BARCODE STATUS HONEST  (IN_STOCK ↔ OUTWARD)
--
-- Dispatching from a batch left every one of that batch's item barcodes reading
-- IN_STOCK/INWARDED, so the Batch Records modal and the registry's In-Stock count
-- never dropped when stock actually left: a batch that shipped 2 of 10 still
-- showed 10 in stock, contradicting the outward table's "remaining 8".
--
-- A trigger on outward_items keeps the item barcodes in step WITHOUT touching the
-- safety-critical save_outward / save_inward RPCs:
--   • on dispatch  → flip up to `quantity` of the batch's in-stock barcodes to
--     OUTWARD, oldest code first (FIFO);
--   • on delete    → flip the same count back to IN_STOCK (delete_outward cascades
--     the outward_items row, so this reverses cleanly).
--
-- Quantity-only ("Generic / No Batch") dispatches carry no item barcodes and are a
-- no-op. Best-effort: if a batch has fewer received barcodes than the quantity
-- (labels were never generated for every unit), it flips what exists — the ledger
-- stays the single source of truth for the number itself (rule 0.7).
-- =============================================================================

create or replace function app.tg_outward_items_flip_barcodes()
  returns trigger language plpgsql security definer set search_path = public, app as
$$
begin
  if (tg_op = 'INSERT') then
    if new.batch_id is not null and new.quantity > 0 then
      update public.product_barcodes
         set status = 'OUTWARD'
       where id in (
         select id from public.product_barcodes
          where product_id = new.product_id
            and batch_id   = new.batch_id
            and status in ('IN_STOCK', 'INWARDED')
          order by code
          limit new.quantity
       );
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.batch_id is not null and old.quantity > 0 then
      update public.product_barcodes
         set status = 'IN_STOCK'
       where id in (
         select id from public.product_barcodes
          where product_id = old.product_id
            and batch_id   = old.batch_id
            and status in ('OUTWARD', 'OUTWARDED')
          order by code
          limit old.quantity
       );
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists tg_outward_items_flip_barcodes on public.outward_items;
create trigger tg_outward_items_flip_barcodes
  after insert or delete on public.outward_items
  for each row execute function app.tg_outward_items_flip_barcodes();

-- -----------------------------------------------------------------------------
-- One-time reconciliation for dispatches that happened before this trigger
-- existed. Per batch: rank its received barcodes by code and mark the first
-- (total already dispatched from that batch) as OUTWARD, the rest IN_STOCK.
-- Deterministic and idempotent — re-running lands on the same result. Only
-- touches received barcodes; GENERATED and VOID are left untouched.
-- -----------------------------------------------------------------------------
with out_per_batch as (
  select batch_id, sum(quantity) as out_qty
  from public.outward_items
  where batch_id is not null
  group by batch_id
),
ranked as (
  select bc.id,
         bc.batch_id,
         row_number() over (partition by bc.batch_id order by bc.code) as rn
  from public.product_barcodes bc
  where bc.batch_id is not null
    and bc.status in ('IN_STOCK', 'INWARDED', 'OUTWARD', 'OUTWARDED')
)
update public.product_barcodes p
   set status = case
         when r.rn <= coalesce(o.out_qty, 0) then 'OUTWARD'::public.barcode_status
         else 'IN_STOCK'::public.barcode_status
       end
  from ranked r
  left join out_per_batch o on o.batch_id = r.batch_id
 where p.id = r.id
   and p.status is distinct from (case
         when r.rn <= coalesce(o.out_qty, 0) then 'OUTWARD'::public.barcode_status
         else 'IN_STOCK'::public.barcode_status
       end);

notify pgrst, 'reload schema';
