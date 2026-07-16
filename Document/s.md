Sprint 1 — App Frontend (React Native / Expo) — **Shrusti**

**Date:** 15 Jul 2026 · **Duration:** 1 day (09:00–18:00)
**Read [CONTRACT.md](./CONTRACT.md) first.** It defines the exact RPC shapes you code against.

---

## Your role this sprint

Build the **mobile barcode flow**: scan → identify product → show live stock → outward it.
This is the app the storekeeper uses every day, so the scan screen is the whole product.
Everything else is a form.

**You are blocked on Mahim until 10:30** (he posts `SUPABASE_URL` + anon key).
**Don't sit idle** — FE-01 through FE-03 need no backend. Do them first.

---

## Task list

Legend — **P0** = sprint fails without it · **P1** = needed for the demo · **P2** = if time allows

### Phase 1 — Scaffold (09:00–10:30, no backend needed)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **FE-01** | `npx create-expo-app@latest` with the TypeScript template. Confirm it runs on a real Android phone via Expo Go. **Use a physical device, not the emulator** — emulator cameras can't scan. | 25m | P0 | — |
| **FE-02** | Install deps: `@supabase/supabase-js`, `expo-camera`, `expo-secure-store`, `react-native-uuid`, `@react-navigation/native` + native-stack. | 15m | P0 | FE-01 |
| **FE-03** | Build the screen shells with hardcoded dummy data — Login, Scan, Product Result, Outward Form, Success. Wire navigation between them. **No API calls yet.** This is why you're not blocked. | 45m | P0 | FE-02 |
| **FE-04** | Create `lib/supabase.ts` — client init reading `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `app.config.ts` `extra`. Use `expo-secure-store` as the auth storage adapter. | 20m | P0 | FE-05 blocked on Mahim's key |

---

### Phase 2 — Auth (10:30–11:15)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **FE-05** | Drop in Mahim's URL + anon key. Confirm the client connects (any trivial query). | 10m | P0 | **BE-05** |
| **FE-06** | Login screen — `supabase.auth.signInWithPassword`. Email + password fields, loading state, error message on bad credentials. | 40m | P0 | FE-05 |
| **FE-07** | Session persistence — app reopens straight to Scan if a session exists. Storekeepers should not log in twice a day. | 20m | P0 | FE-06 |
| **FE-08** | Logout button (put it on Scan screen header — you'll need it constantly while testing roles). | 10m | P1 | FE-06 |

---

### Phase 3 — The scan screen (11:15–13:00) ⭐ core of the sprint

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **FE-09** | Camera permission flow — request on mount, handle **denied** and **denied-permanently** (deep-link to Settings). A permanently-denied camera with no recovery path is a dead app. | 30m | P0 | FE-01 |
| **FE-10** | `CameraView` with `barcodeScannerSettings`. **Enable: `code128`, `ean13`, `upc_a`, `qr`** (per CONTRACT.md). Full-screen preview with a framing overlay. | 50m | P0 | FE-09 |
| **FE-11** | **Scan de-duplication.** The camera fires `onBarcodeScanned` ~10×/second on the same label. Without a guard you'll fire 10 lookups and possibly 10 outwards. Lock on first hit, ignore all scans until the user explicitly taps "Scan Next". | 30m | P0 | FE-10 |
| **FE-12** | Feedback on scan — `expo-haptics` vibration + a short beep. **The user is looking at the product, not the screen.** Without feedback they don't know it worked and they scan again. | 20m | P1 | FE-11 |

> **FE-11 is the task people underestimate.** A "simple" scanner that fires continuously is the #1 cause of duplicate stock movements. Build the lock before you build anything downstream of it.

---

### Phase 4 — Lookup & result (14:00–15:00)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **FE-13** | Call `supabase.rpc('scan_lookup', { p_code })`. Handle **three** distinct states, not two: (1) `data.found === true` → Product Result, (2) `data.found === false` → "Barcode not found" (SRD §13), (3) `error !== null` → network/server failure with a Retry button. | 45m | P0 | **BE-11**, FE-11 |
| **FE-14** | Product Result card — name, brand, model, category, **available qty (large and prominent)**, and the barcode that matched. Buttons: `Outward` / `Scan Next`. | 30m | P0 | FE-13 |
| **FE-15** | Not-found screen — "Barcode not found. Create new product?" Today just show the message + a Scan Next button; product creation is Ram's desktop job. | 15m | P1 | FE-13 |
| **FE-16** | **Manual barcode entry fallback** — a text input on the Scan screen. Damaged/smudged labels happen daily and a scanner-only app strands the user. | 30m | P1 | FE-13 |

> **FE-13 note:** `found: false` arrives with `error === null`. It is a *successful* response meaning "no such barcode" — not a failure. Branch on `data.found`, not on `error`.

---

### Phase 5 — Outward (15:00–16:00)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **FE-17** | **Generate `client_txn_id` (uuid v4) when the form MOUNTS**, store in `useRef`. Reuse on every retry. Read the Idempotency section of CONTRACT.md before writing this. | 15m | P0 | FE-14 |
| **FE-18** | Outward form — qty (numeric), outward type (picker: `SALE`/`DEMO`/`REPLACEMENT`/`INTERNAL_USE`/`SERVICE`/`SAMPLE`), party name, contact person, mobile, invoice no, handed over by, received by. Only qty + type + party name are required today. | 50m | P0 | FE-14 |
| **FE-19** | Client-side validation — qty must be > 0 and ≤ `stock.qty_available`. **This is UX, not security** — the server re-validates. Never trust the client for stock math. | 20m | P0 | FE-18 |
| **FE-20** | Submit → `supabase.rpc('save_outward', {...})`. **Disable the button while in flight** — a double-tap is a double-outward. | 30m | P0 | **BE-12**, FE-17 |
| **FE-21** | Error handling: if `error.message.startsWith('INSUFFICIENT_STOCK')` → "Only X left in stock" (parse the number out). Any other error → generic message + Retry (safe, thanks to FE-17). | 25m | P0 | FE-20 |
| **FE-22** | Success screen — product, qty, party, **new balance from `data.balance_after`**. Auto-return to Scan after 2s. | 20m | P1 | FE-20 |

---

### Phase 6 — Integration & ship (16:00–18:00)

| ID | Task | Est | Pri | Depends |
|---|---|---|---|---|
| **FE-23** | Integration session with Ram + Mahim — run the sprint goal end to end on a real phone against Mahim's seed products. | 60m | P0 | All |
| **FE-24** | **EAS build → APK.** `eas build -p android --profile preview`. Share the install link in the group. ⚠️ **First EAS build takes 15–25 min in the queue — start it by 17:00 or you won't have an APK today.** | 30m | P0 | FE-23 |
| **FE-25** | Empty/loading states pass — no blank white screens while a request is in flight. | 20m | P2 | FE-23 |

> **FE-24 is the one with an external clock.** EAS is a shared build queue. Kick it off before you finish polishing — you can always rebuild.

---

## Definition of Done

- [ ] Login persists across app restarts
- [ ] Camera scans **Code 128, EAN-13, and UPC-A**
- [ ] One physical label = **exactly one** lookup (de-dup works)
- [ ] Unknown barcode shows "not found", doesn't crash, doesn't look like an error
- [ ] Outward reduces stock; the new balance is shown
- [ ] Over-drawing stock shows "Only X left", not a raw Postgres error
- [ ] Double-tapping Submit creates **one** ledger row
- [ ] Airplane-mode submit → error + Retry → **one** ledger row, not two
- [ ] APK installs on a clean phone and runs

---

## Risks

| Risk | Mitigation |
|---|---|
| **Blocked till 10:30** | FE-01→FE-03 need no backend. Build shells with dummy data. |
| **Scanner fires 10×/sec → duplicate outwards** | FE-11 lock. Test by holding the camera on a label for 10 seconds — you should see exactly one lookup. |
| **`client_txn_id` regenerated per retry** | Kills idempotency silently. `useRef`, generated on mount. Not in the submit handler. |
| **Emulator can't scan** | Use a real Android phone from hour one. |
| **EAS queue eats your evening** | Start FE-24 by 17:00. |
| **`scan_lookup` shape ≠ CONTRACT.md** | Ask Mahim to paste real JSON output at 12:00. Diff it before you build FE-14. |

---

## Testing without physical labels

Until Mahim prints labels (BE-21), generate test barcodes on-screen:
[barcode.tec-it.com](https://barcode.tec-it.com) → pick Code 128 → type a seed `sku_barcode`
like `ST-P-000001` → **scan it straight off your laptop screen.** Works fine and needs no printer.

---

## Do not

- Do direct table writes — `supabase.from('stock_ledger').insert()` will be denied by RLS, **by design**. Use the RPCs.
- Trust client-side stock validation as a security boundary. It's a nicety; the server decides.
- Commit a `service_role` key. The anon key is fine and expected — that one's public by design.