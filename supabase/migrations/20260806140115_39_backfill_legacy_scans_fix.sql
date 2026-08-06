-- =============================================================================
-- Migration 39: Fix legacy backfill for OUTWARD barcodes
--
-- Migration 38 attempted to backfill ISSUE scans for legacy OUTWARD barcodes
-- by looking up outward_items by batch_id. However, older outward_items
-- did not have batch_id populated. This migration falls back to product_id
-- or the RECEIVE scan's office_id.
-- =============================================================================

do $$
declare
  v_admin_id uuid;
  v_bc record;
  v_outward record;
  v_inward record;
  v_rcv_scan record;
begin
  select id into v_admin_id from auth.users limit 1;

  for v_bc in (
    select b.id, b.product_id, b.batch_id, b.updated_at, b.updated_by
    from public.product_barcodes b
    where b.status in ('OUTWARD', 'OUTWARDED')
      and not exists (
        select 1 from public.barcode_scans s where s.barcode_id = b.id and s.action = 'ISSUE'
      )
  ) loop
    -- Attempt 1: find an outward document by batch_id
    select o.office_id, o.issued_at
    into v_outward
    from public.outward_items oi
    join public.outwards o on o.id = oi.outward_id
    where oi.batch_id = v_bc.batch_id
    limit 1;

    -- Attempt 2: find an outward document by product_id
    if not found then
      select o.office_id, o.issued_at
      into v_outward
      from public.outward_items oi
      join public.outwards o on o.id = oi.outward_id
      where oi.product_id = v_bc.product_id
      limit 1;
    end if;

    if found then
      insert into public.barcode_scans (
        barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id, scanned_at, scanned_by
      ) values (
        v_bc.id, v_bc.product_id, v_bc.batch_id, v_outward.office_id, 'ISSUE', 'MANUAL', gen_random_uuid(), coalesce(v_outward.issued_at, v_bc.updated_at), coalesce(v_bc.updated_by, v_admin_id)
      );
    else
      -- Attempt 3: if NO outward doc found at all (very old data), use the RECEIVE scan's office
      select office_id into v_rcv_scan from public.barcode_scans where barcode_id = v_bc.id and action = 'RECEIVE' limit 1;
      
      if found then
        insert into public.barcode_scans (
          barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id, scanned_at, scanned_by
        ) values (
          v_bc.id, v_bc.product_id, v_bc.batch_id, v_rcv_scan.office_id, 'ISSUE', 'MANUAL', gen_random_uuid(), v_bc.updated_at, coalesce(v_bc.updated_by, v_admin_id)
        );
      end if;
    end if;
  end loop;

  -- 3. Also fix RECEIVE scans that might have been missed if inward_items didn't match batch_id (though unlikely)
  for v_bc in (
    select b.id, b.product_id, b.batch_id, b.created_at, b.created_by
    from public.product_barcodes b
    where b.status in ('IN_STOCK', 'INWARDED', 'OUTWARD', 'OUTWARDED')
      and not exists (
        select 1 from public.barcode_scans s where s.barcode_id = b.id and s.action = 'RECEIVE'
      )
  ) loop
    select i.office_id, i.received_at
    into v_inward
    from public.inward_items ii
    join public.inwards i on i.id = ii.inward_id
    where ii.product_id = v_bc.product_id
    limit 1;

    if found then
      insert into public.barcode_scans (
        barcode_id, product_id, batch_id, office_id, action, device_source, client_txn_id, scanned_at, scanned_by
      ) values (
        v_bc.id, v_bc.product_id, v_bc.batch_id, v_inward.office_id, 'RECEIVE', 'MANUAL', gen_random_uuid(), coalesce(v_inward.received_at, v_bc.created_at), coalesce(v_bc.created_by, v_admin_id)
      );
    end if;
  end loop;
end $$;
