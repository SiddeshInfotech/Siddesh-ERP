-- =============================================================================
-- 59 — STANDALONE MOBILE SCAN  (scan_mobile) + scan audit on the history views
--
-- WHY THIS EXISTS
--   The phone scanner (Final-Barcode) has no "open document" — a staff member just
--   picks Inward or Outward mode and scans. But migration 40 dropped the 3-arg
--   scan_receive and left only the strict 5-arg version that REQUIRES p_document_id.
--   So the phone's 3-arg call fell through to the 5-arg overload with null context and
--   was rejected ("missing document context"); the app swallowed the error and worked
--   around it by writing product_barcodes.status directly and inserting barcode_scans
--   columns that do not exist — both silent no-ops. Result: a phone scan changed a
--   status but never posted the ledger and never recorded who/when/where.
--
--   This migration adds a DISTINCTLY NAMED standalone RPC so it can never collide with
--   the desktop's document-context scan_receive. The phone sends its mode explicitly
--   (INWARD / OUTWARD); the server enforces the lifecycle guard, posts the ledger, and
--   writes a valid barcode_scans row. The desktop scan_receive is left untouched.
--
--   The reference document (inward_id / outward_id) is DERIVED from the barcode's batch,
--   best-effort — it is nullable on stock_ledger, so a standalone scan is still a valid,
--   auditable movement even when no paperwork row is found.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. scan_mobile — the phone's only write path.
--    Direction is explicit (the phone's Inward/Outward mode), not inferred, so the
--    "cannot outward a unit that was never inwarded" rule is a deliberate check, not
--    an accident of current status.
-- -----------------------------------------------------------------------------
create or replace function public.scan_mobile(
  p_code           text,
  p_client_txn_id  uuid,
  p_direction      text,                               -- 'INWARD' | 'OUTWARD'
  p_device_source  public.scan_source default 'CAMERA'
) returns jsonb
  language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id  uuid := app.current_office_id();
  v_bc         public.product_barcodes;
  v_existing   public.barcode_scans;
  v_new_status public.barcode_status;
  v_action     public.scan_action;
  v_txn_type   public.stock_txn_type;
  v_qty_delta  integer;
  v_ref_id     uuid;
  v_ledger     public.stock_ledger;
begin
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned' using errcode = 'P0001';
  end if;

  if p_direction not in ('INWARD', 'OUTWARD') then
    return jsonb_build_object('ok', false, 'error', 'Unknown scan mode: ' || coalesce(p_direction, 'null'));
  end if;

  -- Idempotency: a scanner fires twice, or a flaky-wifi retry lands. One
  -- client_txn_id = one scan event; the second call returns the first result.
  select * into v_existing from public.barcode_scans where client_txn_id = p_client_txn_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'barcode_id', v_existing.barcode_id);
  end if;

  -- Barcode codes are unique PER OFFICE now (uq_product_barcode_code on office_id,code),
  -- so the lookup must be office-scoped or it could match another branch's unit.
  select * into v_bc
    from public.product_barcodes
   where code = p_code and office_id = v_office_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  if p_direction = 'INWARD' then
    -- Already received: report success idempotently rather than as a failure.
    if v_bc.status in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    if v_bc.status <> 'GENERATED' then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'This unit cannot be received: its status is ' || v_bc.status || '.');
    end if;

    v_new_status := 'INWARDED';
    v_action     := 'RECEIVE';
    v_txn_type   := 'INWARD';
    v_qty_delta  := 1;
    select inward_id into v_ref_id
      from public.inward_items where batch_id = v_bc.batch_id limit 1;

  else  -- OUTWARD
    if v_bc.status in ('OUTWARDED', 'OUTWARD') then
      return jsonb_build_object('ok', true, 'found', true, 'already', true,
        'barcode_id', v_bc.id, 'status', v_bc.status, 'code', v_bc.code);
    end if;
    -- THE GUARD: a unit must have been inwarded before it can go out.
    if v_bc.status not in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object('ok', false, 'found', true,
        'error', 'This unit has not been inwarded yet, so it cannot be outwarded.');
    end if;

    v_new_status := 'OUTWARDED';
    v_action     := 'ISSUE';
    v_txn_type   := 'OUTWARD';
    v_qty_delta  := -1;
    select outward_id into v_ref_id
      from public.outward_items where batch_id = v_bc.batch_id limit 1;
  end if;

  update public.product_barcodes
     set status = v_new_status, updated_by = auth.uid(), updated_at = now()
   where id = v_bc.id;

  -- post_ledger derives balance_after and keeps stock_balances in step, under a row
  -- lock. p_ref_type is doc_ref_type; the stock_txn_type value shares the INWARD/OUTWARD
  -- labels, so cast through text (same approach the desktop scan path uses).
  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := v_bc.product_id,
    p_unit_id       := null,
    p_txn_type      := v_txn_type,
    p_qty_delta     := v_qty_delta,
    p_ref_type      := v_txn_type::text::public.doc_ref_type,
    p_ref_id        := v_ref_id,
    p_notes         := 'Mobile scan (' || p_direction || ') ' || p_code,
    p_computer_name := null,
    p_batch_id      := v_bc.batch_id
  );

  -- The audit row: scanned_by + office_id + action feed the Inwarded / Outwarded /
  -- Scanned By / Scanned At columns on the history views and Batch Records.
  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action,
    device_source, client_txn_id, ledger_id, scanned_by
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, v_action,
    p_device_source, p_client_txn_id, v_ledger.id, auth.uid()
  );

  return jsonb_build_object('ok', true, 'found', true, 'already', false,
    'barcode_id', v_bc.id, 'status', v_new_status, 'code', v_bc.code, 'ledger_id', v_ledger.id);
end;
$$;

revoke all on function public.scan_mobile(text, uuid, text, public.scan_source) from public, anon;
grant execute on function public.scan_mobile(text, uuid, text, public.scan_source) to authenticated;
grant execute on function public.scan_mobile(text, uuid, text, public.scan_source) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Append the four scan-audit columns to v_inward_history and v_outward_history.
--    `create or replace view` may only APPEND columns, so the existing SELECT list is
--    reproduced byte-for-byte from migration 54 and the new columns are added last.
--    Grain is per batch line, so the audit is aggregated over the batch's units:
--    the timestamps are the batch's most recent receive / issue; scanned_by and the
--    office are whoever last changed a unit in that batch.
-- -----------------------------------------------------------------------------
create or replace view public.v_inward_history as
select
  ii.id,
  i.received_at,
  i.inward_no,
  p.name as product_name,
  pb.code as batch_code,
  ii.quantity as inward_qty,
  coalesce(ii.quantity - (select coalesce(sum(quantity), 0) from public.outward_items where batch_id = ii.batch_id), 0) as remaining_qty,
  coalesce(vcs.qty_on_hand, 0) as total_qty,
  i.brought_by,
  ii.product_id,
  i.office_id,
  ii.created_at,
  s.name             as supplier_name,
  s.mobile           as supplier_mobile,
  s.gst_no           as supplier_gst,
  s.address          as supplier_address,
  i.invoice_no,
  i.invoice_date,
  i.purchase_order_no,
  i.notes,
  i.invoice_file_path,
  ii.batch_id        as batch_id,
  coalesce(reg.total_barcodes, 0) as total_barcodes,
  coalesce(reg.qty_generated, 0) as qty_generated,
  coalesce(reg.qty_in_stock, 0) as qty_in_stock,
  coalesce(reg.qty_outward, 0) as qty_outward,
  coalesce(reg.qty_void, 0) as qty_void,
  -- ── Appended in migration 59: scan audit (who / when / where) ────────────────
  (select max(bs.scanned_at) from public.barcode_scans bs
     where bs.batch_id = ii.batch_id and bs.action = 'RECEIVE')            as inwarded_at,
  (select max(bs.scanned_at) from public.barcode_scans bs
     where bs.batch_id = ii.batch_id and bs.action = 'ISSUE')             as outwarded_at,
  (select pr.full_name from public.barcode_scans bs
     left join public.profiles pr on pr.id = bs.scanned_by
    where bs.batch_id = ii.batch_id order by bs.scanned_at desc limit 1)  as scanned_by,
  (select off.name from public.barcode_scans bs
     left join public.offices off on off.id = bs.office_id
    where bs.batch_id = ii.batch_id order by bs.scanned_at desc limit 1)  as scanned_at_office
from public.inward_items ii
  join public.inwards i on i.id = ii.inward_id
  join public.products p on p.id = ii.product_id
  left join public.product_batches pb on pb.id = ii.batch_id
  left join public.suppliers s on s.id = i.supplier_id
  left join public.v_current_stock vcs on vcs.product_id = ii.product_id and vcs.office_id = i.office_id
  left join public.v_batch_registry reg on reg.batch_id = ii.batch_id;

grant select on public.v_inward_history to authenticated;
grant select on public.v_inward_history to service_role;
alter view public.v_inward_history set (security_invoker = on);

create or replace view public.v_outward_history as
select
  oi.id,
  o.issued_at,
  o.outward_no,
  p.name as product_name,
  pb.code as batch_code,
  oi.quantity as outward_qty,
  coalesce((select coalesce(sum(quantity), 0) from public.inward_items where batch_id = oi.batch_id) - (select coalesce(sum(quantity), 0) from public.outward_items where batch_id = oi.batch_id), 0) as remaining_qty,
  coalesce(vcs.qty_on_hand, 0) as total_qty,
  o.outward_type,
  oi.product_id,
  o.office_id,
  oi.created_at,
  c.name           as party_name,
  c.contact_person as contact_person,
  c.mobile         as party_mobile,
  c.gst_no         as party_gst,
  c.address        as party_address,
  o.invoice_no,
  o.sales_order_no,
  o.handed_over_by,
  o.received_by,
  o.delivery_method,
  o.notes,
  -- ── Appended in migration 59: scan audit (who / when / where) ────────────────
  (select max(bs.scanned_at) from public.barcode_scans bs
     where bs.batch_id = oi.batch_id and bs.action = 'RECEIVE')            as inwarded_at,
  (select max(bs.scanned_at) from public.barcode_scans bs
     where bs.batch_id = oi.batch_id and bs.action = 'ISSUE')             as outwarded_at,
  (select pr.full_name from public.barcode_scans bs
     left join public.profiles pr on pr.id = bs.scanned_by
    where bs.batch_id = oi.batch_id order by bs.scanned_at desc limit 1)  as scanned_by,
  (select off.name from public.barcode_scans bs
     left join public.offices off on off.id = bs.office_id
    where bs.batch_id = oi.batch_id order by bs.scanned_at desc limit 1)  as scanned_at_office
from public.outward_items oi
  join public.outwards o on o.id = oi.outward_id
  join public.products p on p.id = oi.product_id
  left join public.product_batches pb on pb.id = oi.batch_id
  left join public.customers c on c.id = o.customer_id
  left join public.v_current_stock vcs on vcs.product_id = oi.product_id and vcs.office_id = o.office_id;

grant select on public.v_outward_history to authenticated;
grant select on public.v_outward_history to service_role;
alter view public.v_outward_history set (security_invoker = on);

-- -----------------------------------------------------------------------------
-- 3. v_recent_scans — one row per scan event for the dashboard activity feed.
--    Per-unit (not aggregated) so the Main Dashboard can show the live stream of
--    inward/outward scans with who / when / where, newest first.
-- -----------------------------------------------------------------------------
create or replace view public.v_recent_scans as
select
  bs.id,
  bs.scanned_at,
  bs.office_id,
  off.name          as scanned_at_office,
  bs.action,
  case bs.action when 'RECEIVE' then 'INWARD' when 'ISSUE' then 'OUTWARD' else bs.action::text end as direction,
  bs.product_id,
  p.name            as product_name,
  pbc.code          as code,
  bs.batch_id,
  pb.code           as batch_code,
  bs.device_source,
  bs.scanned_by,
  pr.full_name      as scanned_by_name
from public.barcode_scans bs
  left join public.products p on p.id = bs.product_id
  left join public.product_barcodes pbc on pbc.id = bs.barcode_id
  left join public.product_batches pb on pb.id = bs.batch_id
  left join public.offices off on off.id = bs.office_id
  left join public.profiles pr on pr.id = bs.scanned_by;

grant select on public.v_recent_scans to authenticated;
grant select on public.v_recent_scans to service_role;
alter view public.v_recent_scans set (security_invoker = on);

notify pgrst, 'reload schema';
