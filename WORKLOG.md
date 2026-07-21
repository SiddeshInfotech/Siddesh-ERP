# Development Worklog

## 21/07/2026 - Batch Management & Inward History
- Added database migration `12_batches.sql` to introduce `product_batches` table and modified inward/outward schema.
- Updated `database.types.ts` manually to represent the new typing changes from the schema.
- Developed the frontend `BatchPicker` React component.
- Upgraded the `Inward.tsx` screen to support:
  - Batch creation directly inside the form.
  - Uploading invoice PDFs direct to the Supabase storage bucket (`invoices`).
  - Rendering an Inward History DataTable with "All" and "Selected Product" toggle.
- Upgraded the `Outward.tsx` screen to support:
  - Specifying the chosen Batch during dispatch.
  - Entering the Delivery Method (e.g. Courier, By Road).
- Updated the RPC contracts strictly within `Document/Contract.md`.
