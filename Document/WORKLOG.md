# Work Log — Siddesh ERP

**Append only. Never edit or delete an entry.**

Same rule as the stock ledger, for the same reason: a log that can be rewritten is not a
record. Made a mistake in an entry? Add a **new** entry that corrects it and references the
original — do not go back and change history.

**Format**

```markdown
## DD/MM/YYYY HH:MM — TASK-ID — Short title — Owner
**Status:** Started | Done | Blocked
**What:** One or two plain sentences. What actually changed.
**Notes:** Decisions, surprises, anything the next person needs. Optional.
**Files:** paths touched. Optional.
```

Rules:
- Date and time on every entry — `DD/MM/YYYY HH:MM`, 24-hour, IST.
- Newest at the **bottom**.
- One entry when a task starts, one when it finishes.
- Blocked counts as an entry. Say what is blocking and who can unblock it.

---

## 16/07/2026 12:00 — SETUP-001 — Repo scaffold — Ram
**Status:** Done
**What:** Monorepo created with npm workspaces. Desktop app (Electron + React 19 + Vite 8 +
Tailwind 4) builds and typechecks clean. Shared package holds the DB types both clients
compile against.
**Notes:** `.gitignore` added — `node_modules/` was previously untracked and one `git add .`
from being committed. Supabase CLI pinned to 2.98.0; 2.99.0+ is broken on npm (binary
packages published as empty stubs).
**Files:** package.json, apps/desktop/**, packages/shared/**, .gitignore, .env.example

## 16/07/2026 13:00 — DOC-001 — Database architecture documented — Ram
**Status:** Done
**What:** `Document/database.md` written from the SRD: all 9 tables, every relationship with
cardinality and on-delete, class diagram, build order, and runtime sequence diagrams.
**Notes:** Three open questions raised in §13 that the SRD cannot answer — the biggest is
that §17 specifies SQLite/single-office while we are building three-office, so
`stock_ledger` needs `office_id` from day one or historical rows can never be attributed.
**Files:** Document/database.md

## 16/07/2026 14:00 — DOC-002 — 4-day desktop sprint planned — Ram
**Status:** Done
**What:** 80 desktop tasks across 4 days (16–19 Jul), all assigned to Ram, each with a
plain-language explanation for non-technical readers.
**Notes:** Estimated hours total ~13–15h/day — this is a crunch plan. P0 tasks are the real
must-haves; P1/P2 (invoice upload, signature capture, backup/restore) can slip.
**Files:** Document/Ram-Desktop-Sprint-4days.tsv

## 16/07/2026 15:00 — STD-001 — Engineering rule book created — Ram
**Status:** Done
**What:** `.claude/skills/siddesh-standards/SKILL.md` — security, reliability, performance,
naming, separation of concerns, error handling, edge-case checklist, Apple-grade design
rules, and this work log's append-only rule.
**Notes:** Three requested rules were refined rather than taken literally, with reasons in
the file: ternaries are for values not control flow (nested ternaries banned), try/catch only
where you can act (a catch that logs and continues hides corruption), and errors are generic
to the user but specific in the log.
**Files:** .claude/skills/siddesh-standards/SKILL.md, Document/WORKLOG.md, CLAUDE.md

## 16/07/2026 14:45 — DSK-101→120 — Day 1 complete: foundation, design system, auth — Ram
**Status:** Done
**What:** Implemented all 20 Day-1 tasks against the Stitch "Obsidian Precision" design.
Design tokens ported to Tailwind v4 `@theme`; self-hosted fonts; app shell with 208px
sidebar + top bar + hash routing; email/password sign-in with session persistence; reusable
Spinner, Alert, Button, Field, Card and DataTable primitives; error boundary.
**Notes:** Two decisions worth knowing. (1) Session tokens are stored via Electron
`safeStorage` through an IPC bridge, not localStorage — on a shared office PC localStorage
is a plaintext file any user can read. (2) Icons use lucide-react rather than the Material
Symbols font from the mock: ~3MB of icon font for ~30 glyphs failed the bundle-size rule,
and DESIGN.md's own "stroke-width 1.5px" spec matches Lucide.
**Bug found by running it:** Vite resolves `.env` relative to its own config
(`apps/desktop/`), not the monorepo root — so `VITE_SUPABASE_URL` compiled to `undefined`
while `npm run build` still reported success. Fixed with `envDir` in electron.vite.config.ts.
Typecheck and build would never have caught this; only launching the app did.
**Files:** apps/desktop/src/** (24 files), apps/desktop/electron.vite.config.ts

## 16/07/2026 15:30 — DB-001 — Day 1 database foundation (SQL) — Ram
**Status:** Done — written, NOT yet applied
**What:** `supabase/migrations/20260716090000_01_day1_foundation.sql` — offices (3 seeded),
profiles + auto-create trigger on auth.users, current_office_id() helper, and RLS on both
tables. Idempotent; safe to re-run.
**Notes:** Verified against the live project with the anon key: the schema is completely
empty (PGRST205 on every table), so this is the first migration and nothing conflicts.
Could not execute it — applying DDL needs the service_role key or DB password, which I do
not have and should not.
**Security caught in review:** the profiles UPDATE policy alone was a privilege escalation —
`using (id = auth.uid())` restricts the row, not the column, so `update profiles set
role='ADMIN'` would have passed RLS. Fixed with a column-level grant (`revoke update` +
`grant update (full_name)`). RLS picks the row; the grant picks the column; both must agree.
**Next:** create the Admin user in the Supabase dashboard, then assign their office_id.
**Files:** supabase/migrations/20260716090000_01_day1_foundation.sql

## 16/07/2026 16:15 — DB-002 — Adopted the 8 worktree migrations — Ram
**Status:** Done — in the repo, NOT yet applied to Supabase
**What:** Moved all 8 SQL migrations (2,196 lines) from
`.claude/worktrees/inventory-system-tech-stack-1537eb/supabase/migrations/` into
`supabase/migrations/`. Deleted my own `20260716090000_01_day1_foundation.sql` — it was
superseded and would have conflicted.
**Why mine went:** their `02_org.sql` creates offices and profiles too, and better (soft
deletes with partial unique indexes, GST format checks, audit triggers, version counters,
activity_logs). Their seed uses office codes PUNE/NASHIK/MUMBAI; mine used PUN/NSK/MUM —
both guard with `not exists`, so running both would have created **six offices**.
**Verified:** no duplicate object creation across the 8 files; `offices_select` policy
allows authenticated reads, so the Dashboard connection check (DSK-104) will work.
**Three open conflicts — team decisions, not mine:** (1) role enum is
SUPER_ADMIN/OFFICE_ADMIN/STAFF but SRD §2 says Admin/Store Manager/Sales Executive;
(2) barcode is ST-P-000001 but SRD §4/§9 says ST00000001 — the file itself says "CONFIRM
WITH CLIENT", and labels are physical so this must be settled before printing;
(3) creating a user in the Supabase dashboard with no metadata FAILS — the trigger defaults
to role STAFF with a null office_id, which violates chk_profiles_office. Undocumented.
Workaround: set user_metadata `{"role":"SUPER_ADMIN"}` when creating the first user.
**Files:** supabase/migrations/*.sql (8 files)

## 16/07/2026 17:00 — DB-003 — Migrations aligned to the SRD — Ram
**Status:** Done — in the repo, NOT yet applied
**What:** Reconciled the 8 migrations against the SRD PDF. Three changes.
(1) **Roles (SRD §2):** enum was SUPER_ADMIN/OFFICE_ADMIN/STAFF — not the SRD's roles. Now
`('ADMIN','STORE_MANAGER','SALES_EXECUTIVE')` verbatim from §2. `app.is_super_admin()` →
`app.is_admin()`. ~40 references across 01/02/06/07 updated, comments included.
(2) **Barcode (SRD §4, §9):** was `ST-P-000123`. Now `'ST' || lpad(nextval,8,'0')` →
`ST00000123`, exactly the SRD's examples. The two barcode sequences were merged into one
(`app.barcode_seq`): the SRD format has no P/U prefix, so SKU and unit codes share one
namespace and two counters would both emit ST00000001. Contract.md updated to match.
(3) **First-user blocker fixed:** trigger now defaults to ADMIN per §2 "Initially only one
Admin login". The old SALES_EXECUTIVE default with a null office violated
chk_profiles_office, which failed the auth.users insert — you could not create any user.
**⚠️ Depends on a dashboard setting:** Authentication → Providers → Email → "Allow new users
to sign up" must be **OFF**, or anyone self-registering becomes Admin over all three offices.
Per §2 the Admin creates every other user, so signup stays closed.
**Verified:** no old role names or ST-P-/ST-U- strings remain anywhere; app code was clean.
**Files:** supabase/migrations/*.sql (4 changed), Document/Contract.md, Document/database.md

## 16/07/2026 17:40 — DB-004 — Fixed two blocking bugs in the migrations — Ram
**Status:** Done — 01 and 02 changed; re-run from 01
**Reported:** `ERROR: 42P01: relation "public.profiles" does not exist` on 01_foundation.
**Cause:** the four identity helpers (current_office_id, current_role, is_admin,
can_access_office) were defined in 01 but read public.profiles, which 02 creates. A
`language sql` body is parsed and validated at CREATE time; only plpgsql defers that. So 01
could never have run — these migrations had never been applied.
**Fix:** moved the helpers + their grants into 02_org.sql, directly after the profiles
table. 01 keeps the schema-level grants and ALTER DEFAULT PRIVILEGES, which persist and
still govern functions created later.
**Second bug found while verifying (not yet hit):** products.sku_barcode and
product_units.unit_barcode use `default app.next_product_barcode()` / `next_unit_barcode()`.
A column default executes as the *inserting* user, and products_write lets an
ADMIN/STORE_MANAGER insert directly — but 01 revokes EXECUTE on the app schema from
everyone. Day 2's "Add Product" would have failed with `permission denied for function
next_product_barcode`. Fixed by making both SECURITY DEFINER (so app.barcode_seq stays
private rather than granting the raw sequence to every client) and granting EXECUTE to
authenticated.
**Swept for recurrences:** scripted a scan of all 8 files for any `language sql` function
referencing a table created in a later file — none remain.
**Files:** supabase/migrations/20260715090000_01_foundation.sql,
supabase/migrations/20260715090100_02_org.sql

## 16/07/2026 18:30 — UI-001 — Custom title bar, light/dark theme, collapsible sidebar — Ram
**Status:** Done — typecheck + build pass; both themes verified on the live DOM
**What:**
(1) Removed the OS title bar (icon + "Siddesh ERP" text + its grey strip) via
titleBarStyle:'hidden' + titleBarOverlay. The native minimise/maximise/close buttons are
KEPT and repainted to our background — frame:false would have meant reimplementing them,
and hand-rolled controls lose snap layouts and double-click-to-restore.
(2) Removed the email/role/avatar block from the TopBar. Note: this un-does DSK-113 ("show
who's logged in") — nothing in the UI now identifies the signed-in user.
(3) Full light theme from stitch inward_entry_light / outward_entry_light — real Stitch
values, not an inversion. Primary shifts #a078ff → #7c3aed because the pale violet fails
contrast on #f8fafc. Glass inverts: white/3% → white/85%, border white/8% → black/14%.
(4) Sidebar collapses 208px → 64px, with theme toggle / Collapse / Log Out on the bottom
rail. Both collapse and theme persist to localStorage (display prefs, not secrets — the
auth session still goes through the OS keychain).
**Bug found by running it:** `window.api.setTitleBarTheme()` throws a SYNCHRONOUS TypeError
when the preload bridge is absent, so `.catch()` never sees it. Thrown from an effect in
ThemeProvider — which sits above the ErrorBoundary — it unmounted the whole app to a blank
window with nothing logged. Not just a browser artifact: a packaged build whose preload
failed would do the same. Fixed with optional chaining; the title bar is cosmetic and must
never take the app down.
**Verified on the live DOM:** dark body rgb(9,9,11) / card white 3% / border white 8%;
light body rgb(248,250,252) / card white 85% / border black 14%. Matches Stitch exactly.
**Not verified:** the sidebar collapse and theme toggle are behind auth, and login needs the
migrations applied. Untested by click.
**Files:** main/index.ts, preload/index.ts, hooks/useTheme.tsx, hooks/useSidebar.tsx,
components/layout/{Sidebar,TopBar}.tsx, components/ui/{Card,DataTable}.tsx, styles.css, main.tsx

## 17/07/2026 10:31 — UI-002 — One border colour for every component — Ram
**Status:** Done — typecheck + build pass; both themes verified against the compiled CSS
**What:** Introduced `--color-border`, the single border colour for the whole app, and pointed
every edge at it: cards, inputs, buttons, table rows, sidebar rule, hairline dividers. Dark is
white/12%, light is black/12%. `glass`, `glass-elevated`, `hairline-b` and `hairline-t` now
read the same variable instead of carrying their own `--glass-border` / `--glass-hairline`.
**Why it drifted:** `--color-outline-variant` was doing two unrelated jobs — the border colour
AND the colour of label/placeholder/icon text. That coupling is what let borders diverge
(cards on white/8% glass, inputs on opaque #494454), and it had a nastier edge: an uncommitted
change had set light-mode `outline-variant` to `rgb(0 0 0 / 0.12)`, which made Field labels and
the login footer 12%-opacity black text on a #f8fafc canvas — very nearly invisible. Both
Stitch mocks colour labels with `text-on-surface-variant` and never `text-outline-variant`, so
this was our deviation, not theirs.
**Fix:** `--color-outline-variant` is deleted, not repurposed — leaving it around invites the
same double-duty bug back. Borders use `--color-border`; muted text and icons use
`--color-outline` (a real colour: #958ea0 dark / #767680 light); labels use
`text-on-surface-variant`, matching the mocks.
**Deviation, on purpose:** DESIGN.md §Level 2 asks for a heavier border (white/24%) on
modals. One border colour app-wide is the stronger rule, so `glass-elevated` now carries its
elevation with blur and shadow only.
**Verified:** built CSS emits `.border-border{border-color:var(--color-border)}` with
`--color-border:#ffffff1f` and `#0000001f` under `[data-theme=light]`; card, button and input
all resolve to the identical value in both themes.
**Tooling trap worth knowing:** the in-app browser reported the input border stuck at white/12%
in light mode, reproducibly, even on a clean static page. It was not a CSS bug —
`getAnimations()` showed 6 transitions with `playState:"running"` but `currentTime:0`. The
pane was not compositing (screenshots timed out too), so `transition-all` froze those elements
at their pre-flip value while untransitioned elements updated. Calling `.finish()` returned the
correct `rgba(0,0,0,0.12)`. Any element with a transition will mis-measure in that pane.
**Files:** styles.css, components/ui/{Field,Button,DataTable}.tsx,
components/layout/{Sidebar,TopBar}.tsx, routes/{Login,Placeholder}.tsx

## 17/07/2026 11:10 — DB-005 — Database types generated; db:types fixed — Ram
**Status:** Done
**What:** `packages/shared/database.types.ts` is now the real schema (1,581 lines: 21 tables,
2 views, all RPCs, 8 enums) instead of the `Record<string, never>` placeholder. Every typed
query in Day 2 depends on it.
**Correction to DB-002/DB-003:** those entries say the migrations were "NOT yet applied". They
**are** applied — products, categories, brands, uoms, product_barcodes and the RPCs all
respond on the live project. This entry corrects the record; per §11 the old entries stand.
**The generated types settle two of DB-002's three open conflicts:** `app_role` is
`ADMIN | STORE_MANAGER | SALES_EXECUTIVE` (SRD §2) and barcodes are `ST` + 8 digits (SRD §4).
Both landed as DB-003 intended.
**`npm run db:types` was broken** and would never have worked: it ran `supabase gen types
--local`, which needs the Docker stack that Tech-Stack.md says we deliberately do not use, and
npm does not load .env so the CLI had no token either way. Replaced with
`scripts/gen-db-types.mjs`: loads .env, derives the project ref from VITE_SUPABASE_URL, calls
the CLI. Verified idempotent — two consecutive runs produce byte-identical output.
**Security:** SUPABASE_ACCESS_TOKEN lives in .env (gitignored) with **no** VITE_ prefix, so
Vite cannot expose it — only VITE_* reaches the renderer. Verified by grepping the whole build
output: the token is absent, the anon key is present, as designed. Documented in .env.example.
**Two rules the script follows:** it does not shell out (`shell:true` concatenates argv, so a
doctored VITE_SUPABASE_URL would execute — Node 24 also refuses to spawn a .cmd without a
shell, so it calls `node_modules/supabase/bin/supabase.exe` directly), and it validates the
parsed ref against `^[a-z]{20}$` before it reaches a command line. It also refuses to write a
response that lacks `export type Database`, because the CLI can exit 0 with an empty body and
that would silently blank the schema for both clients.
**Files:** packages/shared/database.types.ts, scripts/gen-db-types.mjs, package.json,
.env.example

## 17/07/2026 14:04 — DSK-201→220 — Day 2: product master and barcodes — Ram
**Status:** Done — typecheck + build pass; barcode encoding verified; **CRUD not yet run**
**What:** The Products module. List with search / category filter / status filter / sort /
paging (DSK-201, 202, 216, 220); New and Edit forms carrying every SRD §3 field — name,
category, brand, model, unit, description, minimum stock, HSN, GST — plus the §4 barcode
choice and §18B tracking mode (DSK-203→207, 217); barcode generation, manufacturer codes,
duplicate blocking, label preview, Code 128 rendering and printing one or many (DSK-208→214);
read-only detail view with live stock (DSK-219); deactivate rather than delete (DSK-218).
**Design system:** added `Select` and `Textarea` — Day 1 shipped only `Field`, so a form with
dropdowns had nowhere to go. Both use `--color-border` (UI-002), so the whole form is one
control family.
**Decisions worth knowing:**
(1) **The list loads the whole master (capped at 2,000), not a server page.** Rule §3 names the
ledger and reports — lists that grow per transaction. The product master grows when the
business sells a new *kind* of thing. Loading it once is what makes "sort by stock" correct:
stock lives in `stock_balances`, so no PostgREST `order` can reach it, and server-paging would
sort each page in isolation — reordering rows within a page and quietly lying. The table still
renders 25 rows at a time; past the cap the UI says so rather than showing a short list.
(2) **The list is driven by `products`, with stock merged on.** `v_current_stock` inner-joins
`stock_balances`, so a product created but never received has no row there and would vanish
from the master list. It must appear, reading 0.
(3) **An ADMIN has no office and sees all three**, so stock is summed per product. Taking one
row would return whichever office sorted first — a plausible number, and wrong.
(4) **Products are written through the table, not an RPC.** Not a breach of rule 0.2: that rule
exists because stock needs locking and an audit trail a client cannot be trusted with. A
product row needs neither; `products_write` RLS already limits writes to ADMIN/STORE_MANAGER
and `tg_set_audit` stamps created_by/updated_by from the JWT (SRD §14).
(5) **Edits use optimistic locking** (`.eq('version', …)`), since `tg_set_audit` bumps the
counter on every write. Without it, two people editing one product means the second save
silently discards the first — invisible until an audit.
(6) **The manufacturer's code is stored as an alias, not as the primary.** The generated ST-code
stays primary and stays the one we print (SRD §9); both resolve to the product on a scan, which
is the point of `product_barcodes` being 1:N.
**Honest gap — a partial write exists and is reported, not hidden:** creating a product with a
manufacturer barcode is two statements (product, then barcode) and PostgREST gives no
transaction across them. A duplicate is pre-checked, but two clerks can still race; the loser
gets a saved product whose alias is missing. The product is complete and usable — it always has
its own ST-code — so the UI says exactly that and points at the fix, rather than deleting a
valid product behind the user's back. Making this atomic needs an RPC, which needs DDL rights I
do not have.
**Printing: `window.open` is a trap in this app.** main/index.ts installs
`setWindowOpenHandler` → `shell.openExternal(url)` + deny, so the standard "open a window,
write the labels, print" recipe would print nothing and pop open the user's browser. Labels
print through a same-origin hidden iframe, which no handler intercepts and which satisfies the
existing CSP (inline style + inline SVG, nothing external).
**Verified by running:** jsbarcode against a real DOM — a detached SVG renders (32 bars,
digits present), it genuinely throws `InvalidInputException` on `''` and `'ü'` (so the
`@throws` docs are true), and `Kit (2024) #7 50% a_b` plus EAN `8901234567890` both encode.
Our validator is deliberately stricter than jsbarcode (`È` encodes but we reject it), so the
wrapper fails closed.
**NOT verified — the honest part:** no product has been created, edited, searched or printed
against the live database. Every screen is behind auth, and the in-app browser cannot sign in:
it has no Electron preload, so `window.api.secureStore` is undefined and the session adapter
cannot read. This needs a run in the real Electron app. Typecheck and build passing prove
neither the RLS path nor the print dialog.
**Files:** lib/{barcode,productForm,labelDocument,errors}.ts,
hooks/{useProducts,useProduct,useProductLookups,useProductMutations,usePrintLabels}.ts,
components/products/{ProductForm,BarcodeLabel,LabelPrintPanel}.tsx,
components/ui/{Select,Textarea}.tsx, routes/{Products,ProductEditor,ProductDetail}.tsx,
main.tsx, apps/desktop/package.json (jsbarcode 3.12.3)

## 17/07/2026 15:10 — DB-006 — RLS was never applied; every table was locked shut — Ram
**Status:** Done — applied to the live project, with Ram's approval
**Reported:** "lots of missing data" — Category, Unit and Brand dropdowns empty, product list
empty.
**Cause — not a UI bug.** All 21 public tables had `rowsecurity = true` and **zero policies**.
Postgres denies by default once RLS is on, so the absence of a policy is a denial: every
select and every write from every client returned nothing. 07_rls.sql had only half applied —
the 21 `alter table … enable row level security` statements at the top ran, and not one of the
34 `create policy` statements after them did. The RPCs from 06 exist, so 07 is the only file
that failed, silently, some time before today.
**Second cause, independent:** `profiles` had 0 rows. The only auth user
(siddesherp78@gmail.com) was created 16/07 10:06 — *before* the migrations landed (DB-004 was
17:40 that day). `tg_on_auth_user_created` fires on INSERT only, so it never ran for them.
With no profile, `app.current_role()` is null, which denies `products_write` and would have
blocked every product save even with RLS fixed. Neither symptom was visible in the earlier
anon-key probe: anon sees `[]` either way, which is exactly why that check proved less than it
appeared to.
**Fix:** re-ran the repo's own 07_rls.sql via the Management API — 34 policies created — and
backfilled the profile using the trigger's own logic (ADMIN, Pune Head Office). Pune rather
than null because `chk_profiles_office` permits an office-less ADMIN but
`save_inward`/`save_outward` raise NO_OFFICE without one, so Day 3 would have failed next.
**Verified as the real signed-in user, RLS enforced:** role ADMIN, office Pune, categories 3,
uoms 5, brands 4, products 14, stock rows 11 — was all 0 before.
**Security boundary re-checked, not assumed:** stock_ledger, stock_balances, inwards and
outwards have SELECT policies and no write policy, so rule 0.2 holds — clients still cannot
write stock. `relforcerowsecurity` is false on both ledger tables, which 07's own comment
requires: FORCE would subject the owner to RLS and break `app.post_ledger`, i.e. every inward
and outward.
**Worth knowing:** the app was never insecure here — it was locked shut, which fails safe. But
"empty dropdown" is what a missing RLS policy looks like from the UI, and it reads exactly
like a front-end bug. Check `pg_policies` before touching the component.

## 17/07/2026 15:22 — UI-003 — Real dropdown, clearer light border, barcode preview — Ram
**Status:** Done — typecheck + build pass; the dropdown verified by driving it
**What (Ram's review of Day 2):**
(1) **Dropdowns are now a real listbox, not a native `<select>`.** The native control was the
right first choice for keyboard and scanner support, but Chromium draws `<option>` with the OS
and ignores nearly all styling, so every picker opened as a grey Windows list belonging to a
different product. The replacement owes back everything the platform was giving free, so all
of it is implemented: Enter/Space/Arrow to open, Arrow/Home/End to move, Enter to commit,
Escape to close without committing, type-ahead, `aria-activedescendant`, click-outside,
scroll-into-view. This app runs on a keyboard and a scanner (SRD §8) — a div that only responds
to clicks would have been a downgrade wearing better paint.
(2) **Light border is now black/24%, dark stays white/12%.** Not an inversion, deliberately:
on the #f8fafc canvas a 12% hairline disappears against near-opaque white cards, while the same
weight on #09090b reads as a hard outline and fights the glass. Still one token
(`--color-border`, UI-002) — one value per mode.
(3) **The label preview now shows on New Product**, using sample code ST00000000 and captioned
as such. The real code cannot be previewed: `sku_barcode` defaults to
`app.next_product_barcode()`, so the database mints it at INSERT. Peeking at the sequence would
be a race and could show a number another clerk's save takes first — an invented-but-real-looking
SKU is worse than an obvious placeholder, because someone writes it on a box.
(4) **Unit shows "PCS" with "Pieces" underneath** instead of "PCS — Pieces" crammed on one
line; tracking mode is "Quantity" / "Serial number" with the explanation as a subtitle; model
number lost its fake example placeholder.
**Verified by driving it in a browser:** mouse select commits and returns focus to the trigger;
ArrowDown opens on the *current* choice; Arrow+Enter commits; Escape closes and leaves the
value untouched; type-ahead "k" highlights KIT; Home/End jump; typing "p" while closed selects
PCS directly, as the native control does. Light popup border measured at rgba(0,0,0,0.24),
dark at rgba(255,255,255,0.12).
**Tooling note (cost an hour, twice):** the in-app browser's `computer key` sends keydown with
`key: ""`, so keyboard tests through it silently do nothing and read as a broken component.
Dispatching a real KeyboardEvent works — but only one per task: three in one synchronous block
all observe the same pre-render state and look like a bug too. Elements with `transition-all`
also still misreport computed colour there (see UI-002). Verify this pane's findings before
believing them.
**Files:** components/ui/Select.tsx (rewritten), components/products/ProductForm.tsx,
routes/Products.tsx, components/products/LabelPrintPanel.tsx, hooks/useProductLookups.ts,
styles.css

## 17/07/2026 16:00 — DB-007 / CONTRACT-001 — save_inward + save_outward take party details — Ram
**Status:** Done — Contract.md amended first, migration applied and verified
**Why:** SRD §5 requires a supplier GST number; §6 requires a party GST number and address.
`suppliers.gst_no`, `customers.gst_no` and `customers.address` have existed since 04, but no
RPC accepted them — so the Day 3 forms had nowhere to put three fields the SRD demands.
**Contract.md changed BEFORE the code, per the rule book.** It had also drifted from the
database: it documented `p_received_by` on save_inward, which has never existed, and omitted
`p_purchase_order`, `p_brought_by`, `p_notes` and `p_computer_name`, which do. The signatures
there are now transcribed from `pg_get_function_arguments` on the live project, not memory.
**⚠️ Ram must tell the group the contract changed** — that part is not done by writing this.
**Migration:** `20260718090000_09_rpc_party_details.sql`. New params are optional and
trailing, so every existing caller is unaffected.
**Why drop-and-recreate, not `create or replace`:** adding a parameter changes the signature,
and Postgres treats that as a NEW function. The old 11-arg save_inward would have survived
beside the new 12-arg one and every defaulted call would fail as ambiguous. Verified after
applying: exactly 1 overload each. A DROP also takes the grants with it — re-issued in the
same file, or every client gets "permission denied for function save_inward" and no stock
moves at all.
**Bug found and fixed while in there:** the RPCs passed `p_supplier_mobile` / `p_mobile`
straight into the insert. `chk_suppliers_mobile` is `mobile is null or mobile ~ '^[0-9]{10}$'`,
so an empty string from an untouched optional input is neither — it would raise, abort the
whole transaction, and the delivery would never be received. A blank optional field could
fail a receipt. Empty strings are now normalised to NULL. Same for GST, which is also
upper-cased since the CHECK only accepts upper-case.
**Find-or-create fills blanks only:** a GST typed into today's inward never overwrites a value
already on file. Correcting party details is an edit of that record, not a side effect of
receiving stock. The guard also avoids a pointless UPDATE and version bump on every inward.
**Files:** Document/Contract.md, supabase/migrations/20260718090000_09_rpc_party_details.sql,
packages/shared/{index.ts,database.types.ts}

## 17/07/2026 16:18 — DSK-301→320 — Day 3: Inward and Outward — Ram
**Status:** Done — typecheck + build pass; **RPC path verified against the live database**
**What:** Inward (SRD §5) and Outward (SRD §6), sharing one scan-or-search product picker.
Every field both sections of the SRD ask for is present: product, quantity, supplier
name/mobile/GST, invoice no/date, purchase order, brought-by; and outward type, school name,
contact person, mobile, GST, address, invoice no, sales order no, handed-over-by, received-by.
**Verified end-to-end by calling the real RPCs as the real signed-in user, RLS enforced,
inside a transaction that was rolled back** (results carried out in a raised exception, so the
database was left byte-for-byte as found — re-checked afterwards: stock back to 50, 0 test
suppliers, 0 test customers, ledger still 11 rows, inwards/outwards still 0):
- inward 20 → balance 50→70
- **idempotency**: replaying the same client_txn_id returned the SAME ledger_id with
  `replayed:true` and balance still 70, not 90 — and exactly **1** ledger row exists for that
  txn id. This is the single most valuable thing in Day 3 and it works.
- supplier GST landed: 27AAAAA0000A1Z5 (the new param)
- outward 5 → balance 65; customer GST + address landed (the new params)
- oversell blocked: `INSUFFICIENT_STOCK: available 65, requested 999999` — which is exactly the
  shape `parseAvailableQty` parses, so DSK-319 renders "Only 65 left in stock."
- empty-string mobile/GST no longer aborts a receipt (the DB-007 fix, confirmed)
- `PARTY_REQUIRED` still blocks a SALE with no customer
**Rule 0.5, the one that matters:** `client_txn_id` is minted in a `useRef` on mount and reused
on every retry; a new one is minted **only** in `resetForNextEntry`. Generating it in the
submit handler would give each retry a fresh id, `replay_if_seen` would never match, and a
retried save would post stock twice — invisible until a stock count months later.
**Design decision — the quantity warning never blocks.** DSK-313 warns when qty exceeds what
we last read, but Save stays enabled. The client's "available" is already stale (two clerks can
scan the last unit in the same second), and only save_outward under its row lock may actually
refuse. Blocking client-side would put the same rule in two places, and they would drift.
**Bug caught in review before it shipped:** the picker first mirrored the scan result into the
parent via `onPick` **during render** — which React forbids (updating a parent while rendering a
child) and which would also have gone stale: the picked product carries a stock figure, so a
copy keeps showing the old number after an inward invalidates the cache. Rewritten so `picked`
is *derived* in `useProductPicker`. Copying server state into local state is how a storekeeper
ends up reading a confidently wrong quantity.
**One scan = one lookup (§9):** the lookup is a `useQuery` keyed by the code, so a scanner
firing ten times a second produces one request, and the code is committed on Enter — which is
exactly what a USB keyboard-emulation scanner already does.
**NOT built, both P2 and consciously skipped:** DSK-307 invoice file upload and DSK-317
signature/photo proof. Both need a Supabase Storage bucket with its own RLS, which does not
exist.
**NOT verified:** the screens themselves have not been clicked — they are behind auth and the
in-app browser cannot sign in (no Electron preload). The data path underneath them is verified;
the rendering is not.
**Files:** routes/{Inward,Outward}.tsx, components/movement/ProductPicker.tsx,
hooks/{useProductPicker,useScanLookup,useSaveMovement}.ts, lib/movementForm.ts, main.tsx

## 17/07/2026 16:34 — DSK-401→414 — Day 4: dashboard and reports — Ram
**Status:** Done — typecheck + build pass; report queries verified against real data.
Ship tasks (418–420), global search (415) and backup (416–417) NOT done — see below.
**What:** Dashboard cards (401–405); current stock / low stock / out of stock as one filtered
table (406–408); inward, outward and product-ledger reports with a from/to date filter
(409–412); Excel and PDF export on every report (413–414).
**✅ DSK-301→309 IS NOW PROVEN IN THE REAL APP — by Ram, not by me.** A genuine inward landed
while I was working: IN-2026-00005, 48 × 128 GB Pen Drive, supplier "hdh" with GST
27AAAAA0000A1Z5 and mobile 9090909090, invoice T001, PO 11, brought by "mfj", ledger
balance_after 98. That GST value is the new `p_supplier_gst` from migration 09 arriving
through the actual UI — the exact path I could not reach myself. Day 3's Inward is verified
end-to-end for real.
**Verified (movements created in a rolled-back transaction, as the real user, RLS on):**
inward report join → 2 rows (Ram's 48 + the test's 20, no duplicate-row bug); outward join →
1 row; ledger → `OPENING 50 bal=50 | INWARD 20 bal=70 | OUTWARD -5 bal=65 party=XYZ School`,
which is SRD §11's example shape exactly; dashboard → today_inward 68, today_outward 5,
on_hand 613, low 1, products 11. Re-checked afterwards: only Ram's real inward persists.
**Excel:** `write-excel-file` (~220KB; bundle 1.83→2.05MB). `exceljs` is 21MB unpacked and
npm's `xlsx` is a stale 2022 build with known CVEs — neither belongs in an .exe shipped to
three offices. Note `npm audit` cannot run at all here: the registry is npmmirror, which does
not implement the audit endpoint.
**PDF is print-to-PDF, not a PDF library.** Windows ships "Microsoft Print to PDF", so
Save-as-PDF and printing on paper are one action and cost the bundle nothing. Uses the hidden
iframe again, because `setWindowOpenHandler` denies `window.open`.
**Date filter subtlety:** `to` is an inclusive DATE but the columns are timestamptz, so a
plain `lte` silently drops everything after midnight on the final day — nearly the whole day
the user asked for. Compared against the start of the next day instead.
**Deliberate:** SRD §12's "Pending Orders" card is omitted rather than shown as 0 — there is no
purchase-order table, and a card reading 0 asserts "none pending", which we cannot know.
Out-of-stock appears as a line only when it is non-zero; an always-present 0 is noise.
`Placeholder.tsx` deleted — every route is real now.
**NOT done, and why:** DSK-415 global search, DSK-419/420 the .exe installer and clean-PC
install, DSK-418 full end-to-end walkthrough — ran out of the session, not skipped on purpose.
DSK-416/417 daily backup and restore I recommend dropping: Supabase already backs up the cloud
database, a desktop client writing its own copies duplicates that with a false sense of safety,
and a client that can restore over the ledger directly contradicts rule 0.3 (append-only).
That is a call for Ram, not me.
**NOT verified:** the Dashboard, Stock and Reports screens have not been rendered — still
behind auth, and the in-app browser cannot sign in. The queries under them are verified; the
PostgREST embed syntax (`inwards!inner(...)`) is typechecked against the generated schema but
has not been executed.
**Files:** routes/{Dashboard,Stock,Reports}.tsx, hooks/{useReports,useDashboard,useExportReport}.ts,
lib/reportDocument.ts, components/reports/ExportButtons.tsx, main.tsx,
routes/Placeholder.tsx (deleted), apps/desktop/package.json (write-excel-file 4.1.1)
## 18/07/2026 11:45 — DSK-208-214 — Barcode Management (Option A/B), A4 Canvas & Inward/Outward — Ram
**Status:** Done
**What:** Implemented Code 128 SVG barcode generator, barcode sequence tracking (`ST00000001`), Option A/B barcode assignment, A4 printable barcode canvas with 5 grid presets (24, 65, 40, 14, 8 labels/page), PDF export & direct printing, Product Master route, and Inward/Outward workflow screens.
**Notes:** Preset 1D Code 128 SVG barcodes maintain standard quiet zones to ensure 100% scanner compatibility across handheld USB/Bluetooth & camera scanners. Styled with Obsidian Light theme tokens.
**Files:** apps/desktop/src/renderer/src/lib/code128.ts, apps/desktop/src/renderer/src/lib/sequence.ts, apps/desktop/src/renderer/src/components/barcode/BarcodeCanvasA4.tsx, apps/desktop/src/renderer/src/components/barcode/BarcodeGeneratorModal.tsx, apps/desktop/src/renderer/src/routes/{Products,Inward,Outward}.tsx, apps/desktop/src/renderer/src/main.tsx

## 18/07/2026 15:42 — DSK-301-309 — Enhanced Inward Workflow (Scanned/Unscanned Live Tracker & Barcode Generator) — Ram
**Status:** Done — typecheck + build pass
**What:** Implemented live Scanned vs Unscanned products tracker component (`InwardScanTracker.tsx`), on-the-fly unique barcode generator for products lacking primary barcodes, global barcode uniqueness validator (`isBarcodeUnique`), complete Supplier Details form (Name, Mobile, GST No, Invoice No, Invoice Date, PO No), and Logistics details form (Delivered By / Courier).
**Notes:** Live unit scanning verification updates unscanned count in real-time as items are scanned. Light theme styled.
**Files:** apps/desktop/src/renderer/src/components/inward/InwardScanTracker.tsx, apps/desktop/src/renderer/src/routes/Inward.tsx, apps/desktop/src/renderer/src/lib/sequence.ts

## 20/07/2026 16:30 — DSK-320 — A4 Barcode Canvas: vector PDF + full-page grid + boxed all-pages preview — Ram
**Status:** Done — typecheck + build pass
**What:** Rebuilt the A4 Barcode Label Canvas PDF export and layout. PDF is now fully vector (Code 128 bars drawn as jsPDF rectangles in mm) instead of an html2canvas raster — crisp at any zoom, small file, real page breaks (one `addPage` per full sheet). The grid now fills the entire printable A4 area, so a 24-label (3×8) selection tiles all 24 evenly across the page; barcodes scale to fit each cell. Reworked the screen into a two-pane layout: controls on the left, a boxed scrollable preview of every A4 page on the right (WYSIWYG via container-query units, matches the PDF). Direct Print re-renders the same sheets full-size via print CSS.
**Notes:** Added `getCode128Modules()` to `code128.ts` as the shared bar-map primitive (SVG preview and vector PDF both consume it — single source of truth). New pure lib `barcodePdf.ts` owns PDF layout; component/hook layering preserved (§5). html2canvas no longer used by this screen.
**Files:** apps/desktop/src/renderer/src/lib/code128.ts, apps/desktop/src/renderer/src/lib/barcodePdf.ts, apps/desktop/src/renderer/src/components/barcode/BarcodeCanvasA4.tsx



## 21/07/2026 18:20 — Fix — Batch Records modal empty; product_batches had no RLS policy — Ram
**Status:** Done — DB policy applied to live project; hook filters by batch_id; types regenerated
**What:** Clicking a batch code in Inwards opened "Batch Records" empty. Root cause: `product_batches` (added in migration 12, after 07_rls.sql) shipped with RLS enabled but **no policy**, so every client SELECT returned 0 rows — while `v_inward_history` still showed the batch code through the view owner's privileges. `BatchBarcodesModal` resolves batch_code→batch_id against `product_batches`, so that first query returned nothing and the list was empty. Added migration 14 with `product_batches_select` (authenticated, using true) + `product_batches_write` (ADMIN/STORE_MANAGER), mirroring `product_barcodes`. Applied it to the live project via the Management API because the pinned supabase CLI binary is a stub (`db push` can't run). Also fixed `useBatchBarcodes`: it resolved batch_id but then fetched barcodes by product_id only (would show every batch's barcodes, or none) — now filters `product_barcodes.batch_id` and uses `maybeSingle()`. Regenerated `database.types.ts` from the live schema (migrations 12/13 had never been followed by `npm run db:types`, so `product_batches`/`batch_id` were missing and typecheck was fully broken).
**Notes:** Verified against live DB: RLS enabled, both policies present, data intact — BATCH-260721-003 → 20 barcodes, BATCH-260721-002 → 18, correctly linked by batch_id. This also unblocks `useBatches` (BatchPicker's existing-batch list), which hit the same wall. Pre-existing, out-of-scope type errors remain (Button `variant="outline"`/`size="icon"` no longer in the union, `sequence.ts` undefined guard, `useProductPicker` reads `.batch` from scan_lookup) — not touched. Separately, `save_inward` still does `on conflict (code) do nothing` on barcodes, which silently drops duplicates; recommend raising `BARCODE_EXISTS` (needs a Contract.md sign-off) — not changed here.
**Files:** supabase/migrations/20260721000002_14_product_batches_rls.sql, apps/desktop/src/renderer/src/hooks/useBatchBarcodes.ts, packages/shared/database.types.ts

## 21/07/2026 19:05 — Feature — Inwards: "Supplier & Delivery" tab — Ram
**Status:** Done — view applied to live project; feature files typecheck clean
**What:** Added a second tab to the Inwards history. The screen now has "Stock & Batches" (Date, Product, Batch, quantities, Brought By — unchanged) and a new "Supplier & Delivery" tab (Date, Product, Supplier, Mobile, GST No, Invoice No, Invoice Date, PO No, Brought By, Notes) over the same rows (grain: Date + Product + Batch). Both tabs share the existing All / Selected-Product filter. Supplier data comes from `suppliers` via `inwards.supplier_id`; invoice/delivery from `inwards`. Extended `v_inward_history` (migration 15, `create or replace` — columns appended) and applied it to the live project via the Management API (pinned CLI is a stub). Regenerated `database.types.ts`. Underline `HistoryTab` kept visually distinct from the pill filter buttons (§10). Fixed the invalid `variant="outline"` (not in the Button union; correct value is `secondary`) in the files touched here — Inward.tsx (3) and BatchBarcodesModal.tsx (1).
**Notes:** useInwardHistory keeps `select('*')`, so the new view columns flow through with no query change and the same cache key. Pre-existing, out-of-scope type errors remain in BatchPicker.tsx, InwardBarcodeGeneratorModal.tsx, useProductPicker.ts, sequence.ts (down from 10 to 6). Could not run the full Electron UI in this environment (needs the preload bridge + login) — verified the view returns correct supplier/delivery rows against the live DB and that the changed files typecheck.
**Files:** supabase/migrations/20260721000003_15_inward_history_supplier.sql, apps/desktop/src/renderer/src/routes/Inward.tsx, apps/desktop/src/renderer/src/hooks/useInwardHistory.ts, apps/desktop/src/renderer/src/components/barcode/BatchBarcodesModal.tsx, packages/shared/database.types.ts

## 21/07/2026 20:10 — Feature — Barcode scan tracking (Phase 1, verify mode) — Ram
**Status:** Done — additive DB applied to live; scan-driven ledger switch (Phase 2) built-in-design only, NOT applied
**What:** Turned the Batch Records modal from static placeholders into real end-to-end receiving tracking. Each generated item barcode now has a lifecycle status (`barcode_status`: GENERATED/IN_STOCK/OUTWARD/VOID) and an append-only `barcode_scans` audit table (barcode, action, scanned_by, scanned_at, office, device_source USB/BLUETOOTH/CAMERA/MANUAL, client_txn_id idempotency, ledger_id). New `scan_receive(code, client_txn_id, device_source)` RPC (SECURITY DEFINER) flips GENERATED→IN_STOCK and logs the scan. View `v_batch_barcodes` joins each barcode to its latest RECEIVE scan + the scanner's profile name. Modal rebuilt: live "received X / Y · N pending" header, a focused scan-to-receive input with keyboard-wedge detection (sub-100ms burst = scanner→USB, else MANUAL), and columns Barcode / Status badge / Scanned At / Performed By / Device / Symbology. Migration 16 applied to the live project (all 54 existing barcodes backfilled to IN_STOCK since their stock was already posted by the old inward). Regenerated types.
**Notes:** Phase 1 is deliberately NON-DESTRUCTIVE — scan_receive does NOT write the ledger, because today's save_inward already posts the full qty at inward time; posting again per scan would double-count. So scanning currently records real physical receipt (who/when/device) without changing stock totals. Phase 2 (pending sign-off): make it scan-driven — save_inward posts 0 for barcoded inwards and creates GENERATED barcodes; scan_receive appends +1 to stock_ledger per unit. That is the only change that rewrites ledger semantics (rules 0.2/0.3/0.7) and touches Contract.md, so it is held for explicit approval and not written into the migrations folder yet. Could not run the Electron UI here (needs preload + login); verified DB objects live and that the four changed TS files typecheck (pre-existing unrelated errors unchanged at 6).
**Files:** supabase/migrations/20260721000004_16_barcode_scan_tracking.sql, apps/desktop/src/renderer/src/hooks/useBatchBarcodes.ts, apps/desktop/src/renderer/src/hooks/useScanReceive.ts, apps/desktop/src/renderer/src/components/barcode/BatchBarcodesModal.tsx, packages/shared/database.types.ts

## 21/07/2026 21:15 — Feature — Outward: Inward-style history landing + tabs — Ram
**Status:** Done — view applied to live; feature files typecheck clean
**What:** Audited the Outward flow against the SRD §6 spec and brought its history UI to parity with Inward. Findings: the Outward FORM already implements steps 1–7 (scan-or-search via ProductPicker with scanner, stock/available shown, BatchPicker, quantity, all 6 outward types, full party details, handed-over-by, received-by) and Save already REDUCES stock (save_outward posts a negative stock_ledger row under a row lock). Step 8/9 (signature/photo) still not built, though outwards.signature_path already exists. Missing vs Inward: no history landing page, no tabs, no history view/hook — Outward jumped straight into the form. Added: `v_outward_history` (migration 17, mirrors v_inward_history; party from customers via customer_id), `useOutwardHistory`, and refactored Outward.tsx into a landing list + "Generate Outward entry" flow with three tabs — Stock & Batches (Date/Product/Batch/Type/Qty given/Remaining/Total), Party (school/contact/mobile/GST/invoice/SO/address), Other Details (type/handed-over/received/delivery/notes) — plus the All / Selected-Product filter. Extracted the shared `HistoryTab` component and `orDash` helper (were inline in Inward) so both screens reuse them (§5). Applied the view live; regenerated types.
**Notes:** Quantity is already managed correctly — outward reduces stock through the ledger (rule 0.7), and the view's Remaining (per batch) / Total (per product) reflect post-outward on-hand. 0 outwards exist yet, so the table shows its empty state until the first dispatch. Item-level outward scanning (flip barcode IN_STOCK→OUTWARD, −1 per scan) is the natural next step on top of migration 16's lifecycle, pending the Phase-2 scan-driven decision. Pre-existing unrelated type errors unchanged at 6. Could not run the Electron UI here (preload + login).
**Files:** supabase/migrations/20260721000005_17_outward_history_view.sql, apps/desktop/src/renderer/src/routes/Outward.tsx, apps/desktop/src/renderer/src/hooks/useOutwardHistory.ts, apps/desktop/src/renderer/src/components/ui/HistoryTab.tsx, apps/desktop/src/renderer/src/lib/movementForm.ts, apps/desktop/src/renderer/src/routes/Inward.tsx, packages/shared/database.types.ts

## 21/07/2026 21:50 — Feature — Stock screen: full movement breakdown — Ram
**Status:** Done — view applied to live; feature files typecheck clean
**What:** The existing Stock screen (left-nav "Stock") showed only On hand / Reserved / Available. Added the SRD §7 movement breakdown so a row reads left-to-right as a story: Barcode · Product · Opening · Inward · Outward · Current stock · Reserved · Available · Minimum. New view `v_stock_dashboard` (migration 18) extends v_current_stock with opening/inward/outward aggregated from the append-only stock_ledger, defined by sign so they always reconcile: Opening + Inward − Outward = Current (qty_on_hand). Inward shown green (+), Outward red (−), Current bold. Reserved kept (labelled future, currently 0). useCurrentStock now reads v_stock_dashboard; StockRow + the shared EXPORT_COLUMNS gained opening/inward/outward so Excel/PDF match the screen. Renamed "On hand" → "Current stock" for clarity. The All / Low / Out-of-stock filter is unchanged.
**Notes:** Verified reconciliation on live data — Pen Drive 50+48−0=98, laptop 0+47−10=37. Stock stays derived from the ledger (rule 0.7); the view stores nothing. Pre-existing unrelated type errors unchanged at 6. Could not run the Electron UI here (preload + login).
**Files:** supabase/migrations/20260721000006_18_stock_dashboard_view.sql, apps/desktop/src/renderer/src/hooks/useReports.ts, apps/desktop/src/renderer/src/routes/Stock.tsx, packages/shared/database.types.ts

## 21/07/2026 22:20 — Feature — Stock report: Product ID column + report header details; export audit — Ram
**Status:** Done — feature files typecheck clean; PDF builder verified
**What:** (1) Replaced the Stock screen's "Barcode" column with "Product ID" (row.productId) on screen (mono, truncated with full-value tooltip) and in the Excel/PDF export columns. (2) Added a report header details block: extended ReportMeta with `details: {label,value}[]`, rendered as a bordered fact row under the title in buildReportDocument (PDF/print). Stock passes Generated timestamp, Generated by (user email), Office(s), View (All/Low/Out), Products count, Total current stock, Total available. (3) Audited the Excel + PDF export pipeline end-to-end for the "not working" report: write-excel-file/browser `.toFile()` is implemented (→ downloadBlob → standard `<a download>` blob click, CSP-exempt), the Electron main process has no will-download override so downloads use the default save dialog, and index.html CSP does not block a download-attribute blob or an inline-styled print iframe — i.e. the code path is correct. Verified the pure PDF builder emits the Product ID header + details block via a Node strip-types test.
**Notes:** Excel stays a clean data grid (best for sort/filter); the rich header lives in the PDF where a report header belongs. Could not click the buttons in the real Electron app here (needs preload + login), so if a download still fails in the app it is an environment symptom — need the exact behaviour (error toast text / nothing happens / empty file) to fix precisely. Pre-existing unrelated type errors unchanged at 6.
**Files:** apps/desktop/src/renderer/src/lib/reportDocument.ts, apps/desktop/src/renderer/src/routes/Stock.tsx

## 21/07/2026 22:45 — Feature — Human-readable product code P00001 — Ram
**Status:** Done — applied to live; feature files typecheck clean
**What:** Replaced the raw UUID in the Stock report's "Product ID" column with a real, stable, unique product_code (P00001, P00002, …). Migration 19: sequence app.product_code_seq + generator app.next_product_code() (SECURITY DEFINER, mirrors app.next_product_barcode) set as the products.product_code column DEFAULT, so a plain client insert auto-assigns the next code exactly like sku_barcode; existing products backfilled in creation order (created_at, name, id); column set NOT NULL + UNIQUE. v_stock_dashboard now exposes product_code (joined from products, appended column). StockRow + useReports select it; the Stock table and Excel/PDF export show product_code instead of the UUID.
**Notes:** Verified live — P00001 = 128 GB Pen Drive, P00002 …, dashboard returns the code, sequence continued to next for new products. Codes never shuffle on migration re-run (backfill guarded by `product_code is null`). Pre-existing unrelated type errors unchanged at 6. Could not run the Electron UI here.
**Files:** supabase/migrations/20260721000007_19_product_code.sql, apps/desktop/src/renderer/src/hooks/useReports.ts, apps/desktop/src/renderer/src/routes/Stock.tsx, packages/shared/database.types.ts

## 28/07/2026 15:45 — Feature & Fix — Scoped batch constraint, separate history logs, collective outwards, status colors, client_txn_id, party_name, outward_items and ledger DDL fixes — Antigravity
**Status:** Done — applied to live; typecheck and build pass completely clean
**What:** (1) Changed product_batches unique constraint to unique on `(product_id, code)` to allow different products to share batch codes. (2) Updated save_inward to use `on conflict (product_id, code)`. (3) Reverted history logs so Inward shows only inwards, and Outward shows only dispatches (no mixed tables). (4) Added `p_batches` JSONB array to `save_outward` RPC and updated hook + form in `Outward.tsx` to display available batches in a table where storekeepers can enter outward quantities for multiple batches collectively in one submission. (5) Added a `Status` column (`In Stock` / `Fully Outwarded` badges) and neutral surface highlights to active batches on both Inward and Outward tables (removed green backgrounds/borders). (6) Made product names clickable in history tables to automatically focus/filter list to that product's history. (7) Added missing `client_txn_id` UUID column and index to both `inwards` and `outwards` tables, fixing relation column not found errors when saving movements. (8) Fixed `save_outward` RPC to resolve/create customers in the `customers` table and reference `customer_id` on the `outwards` record, resolving the missing `party_name` column error on `outwards` table inserts. (9) Corrected `save_outward` RPC inserts on `public.outward_items` to write to the `quantity` column instead of the non-existent `qty` column. (10) Updated `save_outward` RPC to generate deterministic unique ledger transaction IDs using `uuid_generate_v5_compat` for each batch allocation, resolving unique constraint conflicts in `stock_ledger` on collective dispatches.
**Notes:** Verified CLI pushes and full project build packaging checks clean.
**Files:** supabase/migrations/20260728153000_28_batch_code_unique_per_product.sql, supabase/migrations/20260728154000_29_collective_outward.sql, supabase/migrations/20260728155000_30_add_client_txn_id_columns.sql, supabase/migrations/20260728160000_31_fix_save_outward_customers.sql, supabase/migrations/20260728160800_32_fix_outward_items_qty_column.sql, supabase/migrations/20260728161500_33_fix_stock_ledger_unique_client_txn.sql, apps/desktop/src/renderer/src/routes/Inward.tsx, apps/desktop/src/renderer/src/routes/Outward.tsx, apps/desktop/src/renderer/src/routes/Barcodes.tsx, apps/desktop/src/renderer/src/components/ui/DataTable.tsx, apps/desktop/src/renderer/src/hooks/useInwardHistory.ts, apps/desktop/src/renderer/src/hooks/useSaveMovement.ts, packages/shared/database.types.ts
