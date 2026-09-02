-- =============================================================================
-- Migration 67: Production-grade outward scanning RPC + fix save_inward overload
--
-- FIX: Drop the old 15-param save_inward (without p_manufacturer_barcode).
--   Migration 65 added p_manufacturer_barcode as a new default param, but
--   PostgreSQL treats different arg lists as separate overloaded functions.
--   PostgREST cannot disambiguate the two, causing "Could not choose the best
--   candidate function" errors. Dropping the old signature fixes this.
-- =============================================================================

-- ── Fix: remove the old save_inward overload (15 params, no p_manufacturer_barcode) ──
drop function if exists public.save_inward(
  uuid, uuid, integer, text, text, text, text, date, text, text, text, text, uuid, text, text[]
);

-- =============================================================================
-- PURPOSE
--   Dedicated RPC for outward (dispatch/issue) barcode scanning. Supports:
--     • Internal auto-generated barcodes (product_barcodes.code)
--     • Manufacturer barcodes mapped to individual units (product_barcodes.manufacturer_barcode)
--     • Batch-level ALIAS barcodes (kind='ALIAS') for quantity-based outward
--
-- LOOKUP PRIORITY
--   1. product_barcodes.code            (exact, office-scoped)
--   2. product_barcodes.manufacturer_barcode (exact, office-scoped)
--
-- BARCODE KIND HANDLING
--   UNIT  → single-item outward: flips status to OUTWARDED, ledger -1
--   ALIAS → qty-based outward:   checks stock balance, ledger -p_qty, status unchanged (reusable)
--
-- GUARDS
--   • Office-scoped (multi-branch safe)
--   • Idempotency via client_txn_id
--   • Lifecycle: only INWARDED / IN_STOCK / AVAILABLE can be outwarded
--   • Stock balance check for ALIAS barcodes
--   • FOR UPDATE row lock to prevent concurrent scan races
-- =============================================================================

create or replace function public.scan_outward(
  p_code          text,
  p_client_txn_id uuid,
  p_qty           integer default 1,
  p_device_source public.scan_source default 'CAMERA'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $fn$
declare
  v_office_id   uuid := app.current_office_id();
  v_bc          public.product_barcodes;
  v_existing    public.barcode_scans;
  v_new_status  public.barcode_status;
  v_ref_id      uuid;
  v_ledger      public.stock_ledger;
  v_qty_delta   integer;
  v_is_alias    boolean := false;
  v_stock       integer;
begin
  -- ── 0. Pre-flight checks ──────────────────────────────────────────────────
  if v_office_id is null then
    raise exception 'NO_OFFICE: user profile has no office assigned'
      using errcode = 'P0001';
  end if;

  if p_qty <= 0 then
    return jsonb_build_object(
      'ok',    false,
      'error', 'INVALID_QTY',
      'message', 'Quantity must be greater than zero.'
    );
  end if;

  -- ── 1. Idempotency ────────────────────────────────────────────────────────
  --   A scanner fires twice, or a flaky-wifi retry lands. One client_txn_id =
  --   one scan event; the second call returns the first result.
  select * into v_existing
    from public.barcode_scans
   where client_txn_id = p_client_txn_id;

  if found then
    return jsonb_build_object(
      'ok',         true,
      'replayed',   true,
      'barcode_id', v_existing.barcode_id,
      'code',       p_code
    );
  end if;

  -- ── 2. Multi-strategy barcode lookup (office-scoped) ──────────────────────
  --   Priority 1: Exact match on internal code
  select * into v_bc
    from public.product_barcodes
   where code = p_code
     and office_id = v_office_id
   for update;                        -- row-lock to prevent concurrent scans

  --   Priority 2: Match on mapped manufacturer barcode
  if not found then
    select * into v_bc
      from public.product_barcodes
     where manufacturer_barcode = p_code
       and office_id = v_office_id
     for update;
  end if;

  --   Not found at all
  if not found then
    return jsonb_build_object(
      'ok',      false,
      'found',   false,
      'error',   'BARCODE_NOT_FOUND',
      'message', 'No barcode found matching "' || p_code || '" in this office.'
    );
  end if;

  -- ── 3. Determine if this is an ALIAS (batch-level) or UNIT barcode ────────
  v_is_alias := (v_bc.kind = 'ALIAS');

  -- ── 4. Lifecycle guard ────────────────────────────────────────────────────
  if not v_is_alias then
    -- UNIT barcode: status-based lifecycle
    if v_bc.status in ('OUTWARDED', 'OUTWARD') then
      -- Already dispatched — idempotent success
      return jsonb_build_object(
        'ok',         true,
        'found',      true,
        'already',    true,
        'barcode_id', v_bc.id,
        'status',     v_bc.status,
        'code',       v_bc.code,
        'message',    'This unit has already been outwarded.'
      );
    end if;

    if v_bc.status not in ('INWARDED', 'IN_STOCK', 'AVAILABLE') then
      return jsonb_build_object(
        'ok',      false,
        'found',   true,
        'error',   'NOT_INWARDED',
        'barcode_id', v_bc.id,
        'status',  v_bc.status,
        'code',    v_bc.code,
        'message', 'This unit has not been inwarded yet (status: '
                   || v_bc.status || '). Cannot outward.'
      );
    end if;

    -- UNIT: outward exactly 1 unit
    v_new_status := 'OUTWARDED';
    v_qty_delta  := -1;

  else
    -- ALIAS barcode: quantity-based stock check
    select coalesce(current_stock, 0) into v_stock
      from public.v_current_stock
     where product_id = v_bc.product_id
       and office_id  = v_office_id;

    if coalesce(v_stock, 0) < p_qty then
      return jsonb_build_object(
        'ok',      false,
        'found',   true,
        'error',   'INSUFFICIENT_STOCK',
        'available', coalesce(v_stock, 0),
        'requested', p_qty,
        'code',    v_bc.code,
        'message', 'Insufficient stock. Available: '
                   || coalesce(v_stock, 0) || ', Requested: ' || p_qty || '.'
      );
    end if;

    -- ALIAS stays reusable — no status change
    v_new_status := null;
    v_qty_delta  := -p_qty;
  end if;

  -- ── 5. Update barcode status (UNIT only) ──────────────────────────────────
  if v_new_status is not null then
    update public.product_barcodes
       set status     = v_new_status,
           updated_by = auth.uid(),
           updated_at = now()
     where id = v_bc.id;
  end if;

  -- ── 6. Best-effort outward document reference ─────────────────────────────
  --   Tries to find an outward_items row for this batch. Nullable on
  --   stock_ledger, so the scan is still valid even without paperwork.
  select outward_id into v_ref_id
    from public.outward_items
   where batch_id = v_bc.batch_id
   limit 1;

  -- ── 7. Post stock ledger ──────────────────────────────────────────────────
  v_ledger := app.post_ledger(
    p_client_txn_id := p_client_txn_id,
    p_office_id     := v_office_id,
    p_product_id    := v_bc.product_id,
    p_unit_id       := null,
    p_txn_type      := 'OUTWARD',
    p_qty_delta     := v_qty_delta,
    p_ref_type      := 'OUTWARD'::public.doc_ref_type,
    p_ref_id        := v_ref_id,
    p_notes         := 'Outward scan ' || v_bc.code
                       || case when v_is_alias then ' (ALIAS x' || p_qty || ')' else '' end,
    p_computer_name := null,
    p_batch_id      := v_bc.batch_id
  );

  -- ── 8. Audit trail (barcode_scans) ────────────────────────────────────────
  insert into public.barcode_scans (
    barcode_id, product_id, batch_id, office_id, action,
    device_source, client_txn_id, ledger_id, scanned_by, quantity
  ) values (
    v_bc.id, v_bc.product_id, v_bc.batch_id, v_office_id, 'ISSUE',
    p_device_source, p_client_txn_id, v_ledger.id, auth.uid(),
    case when v_is_alias then p_qty else 1 end
  );

  -- ── 9. Return success ────────────────────────────────────────────────────
  return jsonb_build_object(
    'ok',              true,
    'found',           true,
    'already',         false,
    'replayed',        false,
    'barcode_id',      v_bc.id,
    'product_id',      v_bc.product_id,
    'batch_id',        v_bc.batch_id,
    'status',          coalesce(v_new_status, v_bc.status),
    'code',            v_bc.code,
    'kind',            v_bc.kind,
    'ledger_id',       v_ledger.id,
    'qty',             case when v_is_alias then p_qty else 1 end,
    'balance_after',   v_ledger.balance_after
  );
end;
$fn$;

-- ── Permissions ─────────────────────────────────────────────────────────────
revoke all on function public.scan_outward(text, uuid, integer, public.scan_source) from public, anon;
grant execute on function public.scan_outward(text, uuid, integer, public.scan_source) to authenticated;
grant execute on function public.scan_outward(text, uuid, integer, public.scan_source) to service_role;

notify pgrst, 'reload schema';
