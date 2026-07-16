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
