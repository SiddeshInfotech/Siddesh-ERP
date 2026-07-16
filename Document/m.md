# Sprint 1 — App Backend (Supabase) — **Mahim**

**Date:** 15 Jul 2026 · **Duration:** 1 day (09:00–18:00)
**Read [CONTRACT.md](./CONTRACT.md) first.** It defines the RPC signatures Shrusti codes against.

---

## Your role this sprint

There is **no separate API server**. Supabase exposes your Postgres schema over HTTPS
directly. So "backend" today means: **schema + RLS policies + RPC functions**.
You are the critical path — Ram and Shrusti are blocked until BE-05 lands.

**Your two hard deadlines:**

| Time | Deliverable | Who's blocked |
|---|---|---|
| **10:30** | Supabase URL + anon key posted to group | Shrusti + Ram (everything) |
| **12:00** | `scan_lookup` working | Shrusti (FE-09 onward) |

Ship those two on time even if everything else slips.

---

## Task list

Legend — **P0** = sprint fails without it · **P1** = needed for the demo · **P2** = if time allows

### Phase 1 — Unblock the team (09:00–10:30)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **BE-01** | Create Supabase project, **region = Mumbai (ap-south-1)**. Free tier is fine today. Save the DB password in the team password manager. | 15m | P0 | — |
| **BE-02** | Create `offices` table (`id`, `name`, `code`, `is_active`). Insert 3 rows: Pune, Nashik, Mumbai. | 15m | P0 | BE-01 |
| **BE-03** | Create `profiles` table (`id` → `auth.users.id`, `full_name`, `role`, `office_id`). Trigger on `auth.users` insert to auto-create the profile row. | 30m | P0 | BE-02 |
| **BE-04** | Create one Admin test user in Supabase Auth. Confirm the profile row auto-created. Share the login with Shrusti + Ram. | 10m | P0 | BE-03 |
| **BE-05** | **POST `SUPABASE_URL` + `SUPABASE_ANON_KEY` TO THE GROUP CHAT.** ⏰ **Hard deadline 10:30.** | 5m | P0 | BE-01 |

> BE-05 is five minutes of work that unblocks two people for the whole day. Do not let it slip behind a "let me just finish the schema first."

---

### Phase 2 — Core schema (10:30–12:00)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **BE-06** | Create `products` table: `id`, `name`, `category`, `brand`, `model`, `unit`, `description`, `min_stock`, `hsn_code`, `gst_percent`, `sku_barcode` (unique), `tracking_mode` (`QUANTITY`\|`SERIAL`, default `QUANTITY`), audit columns. | 25m | P0 | BE-03 |
| **BE-07** | Create `product_barcodes` table: `id`, `product_id` FK, `code` **UNIQUE**, `symbology` (`CODE128`\|`EAN13`\|`UPCA`\|`QR`), `is_primary`. This is SRD §4 Option B — manufacturer barcodes. | 20m | P0 | BE-06 |
| **BE-08** | Barcode generator: create sequence `product_barcode_seq`, then `generate_product_barcode()` returning `'ST-P-' \|\| lpad(nextval::text, 6, '0')`. Call it as the default for `products.sku_barcode`. | 30m | P0 | BE-06 |
| **BE-09** | Create `stock_ledger`: `id`, `product_id`, `unit_id` (null today), `office_id`, `qty_delta` (signed int), `txn_type` (`INWARD`\|`OUTWARD`\|`TRANSFER_OUT`\|`TRANSFER_IN`\|`ADJUSTMENT`), `ref_type`, `ref_id`, `balance_after`, `client_txn_id` **UNIQUE**, `created_by`, `created_at`, `computer_name`. **Append-only — no UPDATE, no DELETE, ever.** | 30m | P0 | BE-06 |
| **BE-10** | Create `stock_balances`: PK (`product_id`, `office_id`), `qty`. This is a **cache**, rebuildable from the ledger. The ledger is the truth. | 15m | P0 | BE-09 |

> **BE-09 note:** `client_txn_id UNIQUE` is what makes idempotency work. Don't skip the unique constraint — it's the whole mechanism.

---

### Phase 3 — RPC functions (12:00–15:00)

These carry all the business logic. All are `security definer` so they can write to
tables the caller is denied direct access to.

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **BE-11** | **`scan_lookup(p_code text)`** — resolve a scanned code. Lookup order: (1) `product_barcodes.code` → (2) `products.sku_barcode` → (3) not found. Return the JSON shape in CONTRACT.md **exactly**. Join `stock_balances` for the caller's office. ⏰ **Deadline 12:00 — Shrusti is blocked.** | 45m | P0 | BE-07, BE-10 |
| **BE-12** | **`save_outward(...)`** — signature per CONTRACT.md. Steps: idempotency check on `client_txn_id` (return original result if seen) → `SELECT ... FOR UPDATE` the balance row → validate stock ≥ qty, else `RAISE EXCEPTION 'INSUFFICIENT_STOCK: available %, requested %'` → insert ledger row → update balance → return `{ok, ledger_id, balance_after}`. **All in one transaction.** | 60m | P0 | BE-09, BE-10 |
| **BE-13** | **`save_inward(...)`** — same pattern, `qty_delta` positive, no stock validation needed. | 40m | P1 | BE-12 |
| **BE-14** | Idempotency helper — shared logic for BE-12/BE-13: if `client_txn_id` exists in `stock_ledger`, return that row's result instead of inserting. | 20m | P0 | BE-09 |

> **BE-12 is the highest-risk task of the day.** `SELECT ... FOR UPDATE` is what stops two offices from racing and corrupting the count. Test it with two SQL editor tabs running the same outward at once — if both succeed on 1 unit of stock, your lock is wrong.

---

### Phase 4 — Security (15:00–16:00)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **BE-15** | **Enable RLS on every table.** `products`, `product_barcodes`, `stock_ledger`, `stock_balances`, `offices`, `profiles`. No exceptions. | 15m | P0 | Phase 2 |
| **BE-16** | RLS read policies: authenticated users can `SELECT` products + product_barcodes (global). `stock_balances` + `stock_ledger` scoped to the user's `office_id` from their profile. | 30m | P0 | BE-15 |
| **BE-17** | RLS write policies: **DENY direct INSERT/UPDATE/DELETE on `stock_ledger` and `stock_balances` to all roles.** Writes happen only through the `security definer` RPCs. | 20m | P0 | BE-15 |
| **BE-18** | **RLS verification test.** Log in as a Pune Staff user, query Nashik's `stock_balances`. **You must get 0 rows.** If you get data, your policy is broken and the DB is effectively public. | 20m | P0 | BE-16, BE-17 |

> **BE-15 timing warning:** turn RLS on **early** (right after Phase 2), not at 15:00. If you build all day with RLS off and flip it at the end, every query breaks simultaneously and you'll debug blind at 5pm. The tasks are listed here for grouping — do BE-15 at 12:00.

---

### Phase 5 — Handoff & deploy (16:00–18:00)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **BE-19** | `npx supabase gen types typescript --project-id <id> > packages/shared/database.types.ts` — **commit it.** This is the contract Shrusti and Ram compile against. | 15m | P0 | Phase 2 |
| **BE-20** | Seed 5 demo products with realistic data (Arduino UNO, Servo Motor, 64GB Pen Drive, RFID Module, HDMI Cable). Give each a `sku_barcode`. Inward 20 of each so there's stock to outward. | 20m | P0 | BE-13 |
| **BE-21** | Print physical barcode labels for the 5 seed products (or just display them on Ram's screen — the phone camera reads a screen fine). **Shrusti needs something to actually scan.** | 15m | P1 | BE-20 |
| **BE-22** | Test all 3 RPCs from the Supabase SQL editor with real args. Screenshot the results into the group chat. | 30m | P1 | BE-12, BE-13 |
| **BE-23** | Integration session — sit with Shrusti and Ram, run the sprint goal end to end. | 60m | P0 | All |
| **BE-24** | Post-demo: document any RPC that changed during integration. Update CONTRACT.md. | 15m | P2 | BE-23 |

---

## Definition of Done

- [ ] Anon key posted by 10:30
- [ ] `scan_lookup` returns the exact CONTRACT.md JSON shape by 12:00
- [ ] `save_outward` rejects over-drawing stock with `INSUFFICIENT_STOCK`
- [ ] Calling `save_outward` twice with the same `client_txn_id` writes **one** ledger row
- [ ] Two concurrent outwards on 1 unit of stock → one succeeds, one fails
- [ ] RLS on for all 6 tables; cross-office read returns 0 rows
- [ ] `database.types.ts` committed
- [ ] 5 seed products with stock, scannable

---

## Risks

| Risk | Mitigation |
|---|---|
| **BE-05 slips → 2 people idle all day** | Post the key at 10:30 even if the schema is half done. It doesn't depend on the schema. |
| **`scan_lookup` shape drifts from CONTRACT.md** | Shrusti's UI breaks silently. Paste your actual JSON output in chat at 12:00 so she can diff it. |
| **RLS enabled late** | Turn it on at 12:00, not 15:00. |
| **Race condition in `save_outward`** | `SELECT ... FOR UPDATE`, and actually test with two tabs. |
| **Free tier has no backups** | Fine today (demo data). Switch to Pro **before** real inventory is entered. |

---

## Do not, under any circumstances

- Put the `service_role` key in the app, the repo, or any `.env` you share
- Let the app write to `stock_ledger` directly
- `UPDATE` or `DELETE` a ledger row — corrections are **reversing entries** (SRD §16)
- Ship with RLS off on any table