# Sprint 1 — Shared Contract (Mobile App / Barcode)

**Locked at 09:00. Do not change without telling the whole group in the chat.**

This file is the single source of truth between Mahim (backend) and Shrusti (frontend).
If these two disagree, integration at 16:00 fails.

---

## Sprint Goal (one sentence)

> Scan a barcode on the phone → app identifies the product and shows live stock →
> enter quantity and party → save outward → stock drops, visible on desktop.

Nothing else ships today.

---

## Explicitly OUT of scope today

Say "no, tomorrow" every time one of these comes up:

- Multi-office transfers
- Kits / Bill of Materials
- Serial number tracking
- Invoice file upload
- Signature capture
- Reports / PDF / Excel
- Roles beyond a single Admin login
- Offline queue
- Play Store release (APK direct install only — see BE/FE deploy notes)

---

## RPC Contract

All app ↔ database communication goes through these three functions.
The app **never** does `.from('stock_ledger').insert()` directly — RLS will deny it.

### 1. `scan_lookup(p_code text)`

Called every time a barcode is scanned or typed.

```ts
const { data, error } = await supabase.rpc('scan_lookup', { p_code: '8901234567890' })
```

**Returns** (single JSON object):

```jsonc
{
  "found": true,
  "match_type": "PRODUCT",        // "PRODUCT" | "UNKNOWN"
  "product": {
    "id": "uuid",
    "name": "64 GB Pen Drive",
    "category": "Digital Products",
    "brand": "SanDisk",
    "model": "SDCZ50-064G",
    "unit": "PCS",
    "sku_barcode": "ST00000123"
  },
  "stock": {
    "office_id": "uuid",
    "qty_available": 42
  }
}
```

**When not found:**

```jsonc
{ "found": false, "match_type": "UNKNOWN", "product": null, "stock": null }
```

> `found: false` is **not an error**. `error` stays null. Shrusti branches on `data.found`.

---

### 2. `save_outward(...)`

```ts
const { data, error } = await supabase.rpc('save_outward', {
  p_client_txn_id: uuid,      // REQUIRED — generated on device, see Idempotency
  p_product_id:    uuid,
  p_qty:           2,
  p_outward_type:  'SALE',    // SALE | DEMO | REPLACEMENT | INTERNAL_USE | SERVICE | SAMPLE
  p_party_name:    'XYZ School',
  p_contact_person: 'Mr. Patil',   // nullable
  p_mobile:        '9876543210',   // nullable
  p_invoice_no:    'INV-001',      // nullable
  p_handed_over_by: 'Atharva',     // nullable
  p_received_by:   'Mr. Patil'     // nullable
})
```

**Returns:**

```jsonc
{ "ok": true, "ledger_id": "uuid", "balance_after": 40 }
```

**On insufficient stock** — raises a Postgres exception, so `error` is populated:

```jsonc
{ "message": "INSUFFICIENT_STOCK: available 1, requested 2" }
```

Shrusti: check `error.message.startsWith('INSUFFICIENT_STOCK')` to show a friendly message.

---

### 3. `save_inward(...)`

```ts
const { data, error } = await supabase.rpc('save_inward', {
  p_client_txn_id:  uuid,
  p_product_id:     uuid,
  p_qty:            20,
  p_supplier_name:  'ABC Traders',
  p_supplier_mobile:'9876543210',  // nullable
  p_invoice_no:     'PI-889',      // nullable
  p_invoice_date:   '2026-07-15',  // nullable, ISO date
  p_received_by:    'Atharva'      // nullable
})
```

**Returns:** `{ "ok": true, "ledger_id": "uuid", "balance_after": 62 }`

---

## Idempotency — non-negotiable

A phone on office wifi **will** retry a request that already succeeded.
Without protection, stock gets deducted twice and nobody notices for months.

**Rule:** the device generates a `client_txn_id` (UUID v4) **once per form submission**
— not once per retry. Generate it when the user opens the form, reuse it on every retry.

The RPC stores it. If the same id arrives again, it returns the **original** result
without writing a second ledger row.

```ts
// FE — correct
const txnId = useRef(uuid()).current   // stable across retries

// FE — WRONG, defeats the whole mechanism
onSubmit={() => rpc({ p_client_txn_id: uuid() })}  // new id every retry
```
