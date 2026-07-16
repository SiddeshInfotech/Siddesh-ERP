  3× Desktop .exe  ─┐
                    ├── HTTPS ──►  Supabase
  Android app      ─┘              ├─ PostgreSQL (your data)
                                   ├─ Auth (login, roles)
                                   ├─ Realtime (live sync across offices)
                                   └─ Storage (invoice PDFs, signatures)



his is the part I really want to land.

❌ Direct Postgres connection — putting postgresql://postgres:password@db.xxx.supabase.co:5432 in your Electron app. Do not do this. An Electron app is a ZIP file containing JavaScript. Anyone can unpack it in about thirty seconds with npx asar extract and read every string in it. You'd be shipping full admin access to your client's database to three offices. The same applies to the service_role key — it bypasses all security and must never appear in the .exe or the APK.

all .env credentials store at the db


Race condition and corrupt the count condition

Solution :-
create function save_outward(p_barcode text, p_qty int, ...)
returns uuid
language plpgsql
security definer   -- runs with elevated rights, not the caller's
as $$ ... $$;

The free tier pauses after ~7 days of inactivity and has no backups. Your Plan.md already says move to Pro before real inventory is entered. That's the real deadline, and it's a data-loss concern, not a performance one.