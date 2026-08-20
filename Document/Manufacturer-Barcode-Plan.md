# Manufacturer Barcode — Design & Implementation Plan

**Status:** PLAN ONLY — not yet implemented. No migration, no code written from this document yet.
**Date:** 20/08/2026
**Decisions locked (owner):**
1. Discriminator = an **explicit column** on `product_barcodes` (`kind`), not an implicit rule.
2. Quantity capture = **scan once, type the quantity** (not count-by-repeated-scan).
3. Receiving path = **either desktop or mobile is allowed, with a clear anti-double-count warning** in the UI.

This plan spans three repos:
- **Supabase** — `C:\Company_Projects\Siddesh-ERP\supabase\migrations`
- **Desktop** — `C:\Company_Projects\Siddesh-ERP\apps\desktop`
- **Mobile (Flutter)** — `C:\Company_Projects\Final-Barcode`

---

## 1. The problem

Option A (auto-generated barcodes) works because **each physical unit has a unique code** = one
row in `product_barcodes` with its own `status`. The phone scans the code → `scan_mobile` flips
*that row* `GENERATED → INWARDED → OUTWARDED` and posts ±1 to the ledger. **One scan = one unit.**

A **manufacturer barcode is identical on every unit** (a whole carton of pen drives all read
`8901234567890`). There is therefore only **one** `product_barcodes` row for it — an *alias* for
the product, not a per-unit token. If the phone routes that code through `scan_mobile`:
- the first scan flips the single alias row, and the second scan returns *"already inwarded"* —
  so **200 units can never be counted**, and
- the alias row (product identity) gets a lifecycle status it was never meant to hold.

A code that is the same on every unit **cannot** yield per-unit history. Manufacturer barcodes are
inherently the **QUANTITY** model (`products.tracking_mode` already names this): *scan once, count
the quantity.*

---

## 2. The three questions, answered

| Question | Answer |
|---|---|
| How does the app know **inward vs outward**? | Already known, and **not** from the barcode. The user picks **Inward Scanner** / **Outward Scanner** mode (`ScannerMode` in `barcode_scanner_screen.dart`), which is passed as the direction. No change. |
| How does the app know **which product**? | The scan lookup (`lookupProductByCode`) resolves the code → product via `product_barcodes`, office-scoped by RLS. A manufacturer code has one row → resolves cleanly. No change. |
| What is **new**? | One bit: *is this code a per-unit token (UNIT) or a shared product identity (ALIAS)?* That bit selects the flow. |

---

## 3. Design — one new bit, one new flow

### 3.1 Discriminator (DB, explicit)
Add `product_barcodes.kind`:
- `'UNIT'` — Option A per-unit code (has a batch + status lifecycle).
- `'ALIAS'` — product identity: the manufacturer code **and** the product's own SKU code. No
  per-unit meaning; tracked by quantity.

The scan lookup returns `kind` so the app branches. Backfill on migration:
`batch_id IS NULL → 'ALIAS'`, else `'UNIT'`. Option B "Link manufacturer barcode" (desktop) sets
`'ALIAS'` on insert.

### 3.2 Quantity flow (new)
When a scan resolves to an **ALIAS**:
1. Phone shows product + a **quantity** field (default 1).
2. Save → new RPC **`scan_mobile_quantity`** posts a single ±qty ledger entry
   (office-scoped, idempotent, OUTWARD guarded against stock). **No** per-unit status flip.
3. The unit-only `getBarcodeStatus` "already scanned" guard is **skipped** for this flow.

### 3.3 UNIT flow (Option A) — untouched
Still `scan_mobile`, still ±1 per unique code. This plan must not regress it.

### 3.4 Audit & stock
The quantity movement lands in `stock_ledger` (which already records who / when / where / qty /
ref — that *is* the audit trail). To keep the existing "scanned by" surfaces and dashboards
working, `scan_mobile_quantity` also writes **one** `barcode_scans` row carrying the quantity (new
`barcode_scans.quantity` column, default 1 so every existing per-unit row stays correct at 1).
Stock stays ledger-derived — never stored (rule 0.7).

---

## 4. Phased plan

### Phase 0 — Contract first (rule §12: Contract.md is locked; change it *before* the code)
Add to `Document/Contract.md` and tell the group:
- `scan_mobile_quantity(p_code text, p_client_txn_id uuid, p_direction text, p_qty int, p_device_source scan_source default 'CAMERA') → jsonb`
- the new `kind` field on the scan-lookup result.

### Phase 1 — Supabase (one new migration)
Concretely:
1. `alter table product_barcodes add column kind text not null default 'UNIT'`
   with a `check (kind in ('UNIT','ALIAS'))`; backfill `ALIAS` where `batch_id is null`.
2. `alter table barcode_scans add column quantity int not null default 1 check (quantity > 0)`.
3. `create function scan_mobile_quantity(...)` (security definer), mirroring `scan_mobile`
   (migration 59) but:
   - `p_qty` explicit; resolves product from `code` (office-scoped).
   - INWARD: `app.post_ledger(... p_qty_delta => +p_qty, p_txn_type => 'INWARD')`.
   - OUTWARD: check `available >= p_qty` (reuse the `save_outward` insufficient-stock guard),
     then `p_qty_delta => -p_qty`.
   - Idempotent on `p_client_txn_id` (return the first result on replay).
   - Ref doc (`inward_id` / `outward_id`) derived best-effort, null allowed.
   - Insert **one** `barcode_scans` row with `quantity = p_qty`, `action` RECEIVE/ISSUE.
   - **No** `product_barcodes.status` update.
   - `grant execute … to authenticated, service_role`; `revoke … from public, anon`.
4. Make the lookup surface `kind` (extend the select the mobile app uses, or a small resolve
   view/RPC).
5. Audit the scan-aggregating surfaces and switch `count()` → `sum(quantity)` where a quantity
   movement can appear: `v_recent_scans`, `my_scan_stats`, `my_scan_history`, and the scan-audit
   columns on `v_inward_history` / `v_outward_history`.

> The migration is written in this repo but must be **applied to the live Supabase project by the
> owner** via the SQL editor — Claude cannot run it.

### Phase 2 — Desktop
- `BarcodeEditor.tsx` → `linkManufacturerBarcode()` sets `kind: 'ALIAS'` on the insert.
- The Inward/Outward forms already track by quantity, so **no movement change**. Add the
  anti-double-count note (see §5) to the manufacturer-product context.

### Phase 3 — Mobile (Flutter, `C:\Company_Projects\Final-Barcode`)
- `supabase_service.dart` `lookupProductByCode` → also read `kind`; expose it on the product/result.
- `barcode_scanner_screen.dart` → for ALIAS, skip the `getBarcodeStatus` guard; route to the
  quantity entry.
- `inward_entry_screen.dart` / `outward_entry_screen.dart` → replace the hardcoded
  `_quantity = 1` with a real quantity input (default 1) for the ALIAS flow.
- `api_service.dart` `recordInward` / `recordOutward` → call `scan_mobile_quantity` (with qty) for
  ALIAS, keep `scan_mobile` for UNIT.
- Mint `client_txn_id` **once per save** (rule 0.5). Today `scanMobile` generates a fresh UUID on
  every call (`supabase_service.dart`), which would double-post on a retry — fix as part of this.

---

## 5. Edge cases to build for
- OUTWARD qty > available stock → **server rejects** (reuse `save_outward` guard). Client shows
  "Only X in stock".
- Idempotent quantity save — one `client_txn_id` per submission, reused on retry.
- **Anti-double-count (locked: "either, with warning"):** a manufacturer delivery is entered once
  — *either* the desktop Inward form *or* a mobile quantity scan, never both. UI copy on both
  surfaces must say so plainly.
- The product's own **SKU code is also an ALIAS** → scanning it uses the quantity flow too
  (consistent behaviour).
- Empty / 0 / negative quantity rejected at the field and again in the RPC `check`.
- Very large mistyped quantity (e.g. 999999999) — sane upper bound on the field.

---

## 6. File touch list (for the implementation PR — not yet edited)

**Supabase**
- `supabase/migrations/<NNN>_manufacturer_barcode_quantity.sql` (new)
- `Document/Contract.md` (Phase 0)

**Desktop**
- `apps/desktop/src/renderer/src/routes/BarcodeEditor.tsx` (set `kind: 'ALIAS'`)

**Mobile (`C:\Company_Projects\Final-Barcode`)**
- `lib/services/supabase_service.dart`
- `lib/services/api_service.dart`
- `lib/screens/barcode_scanner_screen.dart`
- `lib/screens/inward_entry_screen.dart`
- `lib/screens/outward_entry_screen.dart`

---

## 7. What is explicitly NOT in scope
- Per-unit history for manufacturer goods (impossible from a shared code; would require
  overprinting our own serial label — `tracking_mode = SERIAL`). Owner chose quantity-only.
- Any change to the Option A unit lifecycle or `scan_mobile`.
