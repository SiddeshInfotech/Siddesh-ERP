# Shared Contract — RPC signatures

**Locked. Do not change without telling the whole group in the chat.**

This file is the single source of truth between Mahim (backend) and Shrusti (frontend).
If these two disagree, integration fails.

> **Amended 18/07/2026 — Ram.** Two changes, both driven by the desktop Day 3 build.
>
> 1. **This file had drifted from the database.** It documented `p_received_by` on
>    `save_inward`, which does not exist, and omitted `p_purchase_order`, `p_brought_by`,
>    `p_notes` and `p_computer_name`, which do. The signatures below are now verified against
>    `pg_get_function_arguments` on the live project, not transcribed from memory.
> 2. **Three SRD fields could not reach the database.** SRD §5 requires a supplier GST number
>    and §6 requires a party GST number and address. `suppliers.gst_no`, `customers.gst_no`
>    and `customers.address` all exist, but no RPC accepted them, so the forms had nowhere to
>    put them. Added as optional trailing parameters.
>
> **Nothing existing breaks:** every new parameter defaults to NULL, so any current call site
> compiles and behaves exactly as before. Callers that do not send them are unaffected.

> **Amended 21/07/2026 — Antigravity.** Batch Management & Outward Delivery Method.
> Added `p_batch_id` to both `save_inward` and `save_outward`. Added `p_invoice_file_path` to `save_inward`. Added `p_delivery_method` to `save_outward`.

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
  p_sales_order_no: 'SO-22',       // nullable — SRD §6 step 5
  p_handed_over_by: 'Atharva',     // nullable
  p_received_by:   'Mr. Patil',    // nullable
  p_notes:         null,           // nullable
  p_computer_name: 'PUNE-PC-01',   // nullable — SRD §14 audit trail
  p_party_gst:     '27AAAAA0000A1Z5', // nullable — SRD §6, added 18/07/2026
  p_party_address: 'Nashik Road',     // nullable — SRD §6, added 18/07/2026
  p_signature_path: null,             // nullable — SRD §6 step 8
  p_batch_no:      'B-001',           // nullable — added 21/07/2026
  p_delivery_method: 'Courier',       // nullable — added 21/07/2026
})
```

`p_party_name` is required when `p_outward_type = 'SALE'` — the server raises
`PARTY_REQUIRED` otherwise. Every other type may leave it null.

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
  p_purchase_order: 'PO-1042',     // nullable — SRD §5 step 4
  p_brought_by:     'Blue Dart',   // nullable — SRD §5 step 5
  p_notes:          null,          // nullable
  p_computer_name:  'PUNE-PC-01',  // nullable — SRD §14 audit trail
  p_supplier_gst:   '27AAAAA0000A1Z5', // nullable — SRD §5, added 18/07/2026
  p_invoice_file_path: 'invoices/abc.pdf', // nullable — SRD §5 step 6, added 21/07/2026
  p_batch_no:       'B-001',       // nullable — added 21/07/2026
})
```

**Returns:** `{ "ok": true, "ledger_id": "uuid", "inward_id": "uuid", "balance_after": 62, "replayed": false }`

> There is **no** `p_received_by` on `save_inward`. An earlier version of this file listed
> one; it never existed in the database. The person who delivered the goods is
> `p_brought_by` (SRD §5 step 5).

### Supplier / customer find-or-create

Both RPCs look the party up by `lower(trim(name))` and create it if absent. The GST and
address parameters **fill blanks only** — they never overwrite a value already on file.
A typo typed into today's inward must not silently rewrite a supplier's GST number; correcting
existing party details is an edit on that record, not a side effect of receiving stock.

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
