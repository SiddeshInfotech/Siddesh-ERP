-- =============================================================================
-- Migration 38: Backfill legacy barcode scans
--
-- Older barcodes were marked as INWARDED or OUTWARDED by legacy inward/outward
-- functions without appending to `barcode_scans`. This migration artificially
-- injects the missing RECEIVE and ISSUE scan records so the UI's Batch Records
-- can correctly display Inwarded/Outwarded timestamps and offices.
-- =============================================================================

do $$
declare
  v_admin_id uuid;
  v_bc record;
  v_inward record;
  v_outward record;
begin
  -- Get an admin user ID to use as a fallback for scanned_by
  select id into v_admin_id from auth.users limit 1;

  -- 1. Backfill RECEIVE scans for any barcode that is IN_STOCK, INWARDED, OUTWARD, or OUTWARDED
  for v_bc in (
    select b.id, b.product_id, b.batch_id, b.created_at, b.created_by
    from public.product_barcodes b
    where b.status in ('IN_STOCK', 'INWARDED', 'OUTWARD', 'OUTWARDED')
      and not exists (
        select 1 from public.barcode_scans s where s.barcode_id = b.id and s.action = 'RECEIVE'
      )
  ) loop
    -- Attempt to find the inward document for this batch
    select i.office_id, i.received_at
    into v_inward
    from public.inward_items ii
    join public.inwards i on i.id = ii.inward_id
    where ii.batch_id = v_bc.batch_id
    limit 1;

    if found then
      insert into public.barcode_scans (
        barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id, scanned_at, scanned_by
      ) values (
        v_bc.id, v_bc.product_id, v_bc.batch_id, v_inward.office_id, 'RECEIVE', 'MANUAL', gen_random_uuid(), coalesce(v_inward.received_at, v_bc.created_at), coalesce(v_bc.created_by, v_admin_id)
      );
    end if;
  end loop;

  -- 2. Backfill ISSUE scans for any barcode that is OUTWARD or OUTWARDED
  for v_bc in (
    select b.id, b.product_id, b.batch_id, b.updated_at, b.updated_by
    from public.product_barcodes b
    where b.status in ('OUTWARD', 'OUTWARDED')
      and not exists (
        select 1 from public.barcode_scans s where s.barcode_id = b.id and s.action = 'ISSUE'
      )
  ) loop
    -- Attempt to find an outward document for this batch
    select o.office_id, o.issued_at
    into v_outward
    from public.outward_items oi
    join public.outwards o on o.id = oi.outward_id
    where oi.batch_id = v_bc.batch_id
    limit 1;

    if found then
      insert into public.barcode_scans (
        barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id, scanned_at, scanned_by
      ) values (
        v_bc.id, v_bc.product_id, v_bc.batch_id, v_outward.office_id, 'ISSUE', 'MANUAL', gen_random_uuid(), coalesce(v_outward.issued_at, v_bc.updated_at), coalesce(v_bc.updated_by, v_admin_id)
      );
    end if;
  end loop;

end $$;
