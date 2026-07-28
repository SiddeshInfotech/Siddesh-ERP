-- =============================================================================
-- 36 — MOVEMENT DELETION AS APPEND-ONLY REVERSAL  (SRD §16; rule 0.3)
--
-- The previous delete_inward / delete_outward (migration 21) did a plain
-- DELETE FROM inwards/outwards. Because stock_ledger has no FK back to those
-- documents and is append-only (tg_ledger_append_only blocks DELETE), the
-- document vanished but its ledger row and the stock_balances cache were left
-- untouched — so deleting a receipt or dispatch did NOT change stock, directly
-- contradicting the confirmation dialog ("stock will be adjusted automatically").
--
-- Correct behaviour (SRD §16 "never delete, only append"; rule 0.3 "corrections
-- are reversing entries"): post a reversing ADJUSTMENT through app.post_ledger,
-- which recomputes the balance under a row lock and updates the cache, THEN drop
-- the operational document. The ledger keeps both the original movement and its
-- reversal — a full, immutable audit trail — and stock lands where it should.
--
-- Because post_ledger writes batch_id on the reversal, v_stock_balances_by_batch
-- (the per-batch remaining the UI reads) stays correct through a delete too.
--
-- delete_ledger_entry (migration 21) also referenced stock_ledger.inward_id /
-- outward_id, columns that do not exist — it would throw at runtime. It is
-- rewritten to resolve the source document via ref_type / ref_id and delegate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- delete_inward — reverse every received line, then remove the document.
-- Reversing a receipt whose stock was already dispatched would drive the balance
-- negative; post_ledger raises INSUFFICIENT_STOCK, which we surface as a clear
-- "Cannot delete" the UI already knows how to show.
-- -----------------------------------------------------------------------------
create or replace function public.delete_inward(p_inward_id uuid)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id uuid;
  v_inward_no text;
  v_item      record;
begin
  select office_id, inward_no into v_office_id, v_inward_no
    from public.inwards where id = p_inward_id;
  if not found then
    raise exception 'INWARD_NOT_FOUND: inward entry % does not exist', p_inward_id using errcode = 'P0001';
  end if;

  if not app.can_access_office(v_office_id) then
    raise exception 'PERMISSION_DENIED: cannot delete inward from another office' using errcode = 'P0001';
  end if;

  for v_item in
    select id, product_id, quantity, batch_id
      from public.inward_items where inward_id = p_inward_id
  loop
    begin
      perform app.post_ledger(
        p_client_txn_id := public.uuid_generate_v5_compat(p_inward_id, 'reversal:' || v_item.id::text),
        p_office_id     := v_office_id,
        p_product_id    := v_item.product_id,
        p_unit_id       := null,
        p_txn_type      := 'ADJUSTMENT',
        p_qty_delta     := - v_item.quantity,     -- undo the +quantity of the receipt
        p_ref_type      := 'ADJUSTMENT',
        p_ref_id        := p_inward_id,           -- trace to the (soon deleted) source
        p_notes         := 'Reversal of deleted inward ' || coalesce(v_inward_no, p_inward_id::text),
        p_batch_id      := v_item.batch_id
      );
    exception when others then
      if position('INSUFFICIENT_STOCK' in SQLERRM) > 0 then
        raise exception 'Cannot delete: stock from this inward has already been dispatched.'
          using errcode = 'P0001';
      end if;
      raise;
    end;
  end loop;

  delete from public.inwards where id = p_inward_id;   -- cascades inward_items
end;
$$;

-- -----------------------------------------------------------------------------
-- delete_outward — restore every dispatched line, then remove the document.
-- Restoring stock can never drive the balance negative, so no guard is needed.
-- -----------------------------------------------------------------------------
create or replace function public.delete_outward(p_outward_id uuid)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_office_id  uuid;
  v_outward_no text;
  v_item       record;
begin
  select office_id, outward_no into v_office_id, v_outward_no
    from public.outwards where id = p_outward_id;
  if not found then
    raise exception 'OUTWARD_NOT_FOUND: outward entry % does not exist', p_outward_id using errcode = 'P0001';
  end if;

  if not app.can_access_office(v_office_id) then
    raise exception 'PERMISSION_DENIED: cannot delete outward from another office' using errcode = 'P0001';
  end if;

  for v_item in
    select id, product_id, quantity, batch_id
      from public.outward_items where outward_id = p_outward_id
  loop
    perform app.post_ledger(
      p_client_txn_id := public.uuid_generate_v5_compat(p_outward_id, 'reversal:' || v_item.id::text),
      p_office_id     := v_office_id,
      p_product_id    := v_item.product_id,
      p_unit_id       := null,
      p_txn_type      := 'ADJUSTMENT',
      p_qty_delta     := v_item.quantity,       -- undo the -quantity of the dispatch
      p_ref_type      := 'ADJUSTMENT',
      p_ref_id        := p_outward_id,
      p_notes         := 'Reversal of deleted outward ' || coalesce(v_outward_no, p_outward_id::text),
      p_batch_id      := v_item.batch_id
    );
  end loop;

  delete from public.outwards where id = p_outward_id;  -- cascades outward_items
end;
$$;

-- -----------------------------------------------------------------------------
-- delete_ledger_entry — resolve the source document from ref_type / ref_id and
-- delegate to the reversal RPCs above (which own the permission check). The old
-- body read non-existent inward_id / outward_id columns.
-- -----------------------------------------------------------------------------
create or replace function public.delete_ledger_entry(p_ledger_id uuid)
returns void
language plpgsql security definer set search_path = public, app as
$$
declare
  v_ref_type doc_ref_type;
  v_ref_id   uuid;
begin
  select ref_type, ref_id into v_ref_type, v_ref_id
    from public.stock_ledger where id = p_ledger_id;
  if not found then
    raise exception 'LEDGER_NOT_FOUND: ledger entry % does not exist', p_ledger_id using errcode = 'P0001';
  end if;

  if v_ref_type = 'INWARD' and v_ref_id is not null then
    perform public.delete_inward(v_ref_id);
  elsif v_ref_type = 'OUTWARD' and v_ref_id is not null then
    perform public.delete_outward(v_ref_id);
  else
    raise exception 'Cannot delete: this ledger entry has no reversible source document.'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.delete_inward(uuid)       from public, anon;
revoke all on function public.delete_outward(uuid)      from public, anon;
revoke all on function public.delete_ledger_entry(uuid) from public, anon;

grant execute on function public.delete_inward(uuid)       to authenticated, service_role;
grant execute on function public.delete_outward(uuid)      to authenticated, service_role;
grant execute on function public.delete_ledger_entry(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
