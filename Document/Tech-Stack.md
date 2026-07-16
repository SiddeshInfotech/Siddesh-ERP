# Siddesh ERP — Tech Stack

**Status:** documentation-only repo — no application code has been committed yet.
Everything below is the stack the project has committed to in
[Plan.md](./Plan.md), [Contract.md](./Contract.md), [m.md](./m.md) (backend sprint)
and [s.md](./s.md) (frontend sprint).

---

## Architecture at a glance

```
  3× Desktop .exe  ─┐
                    ├── HTTPS ──►  Supabase
  Android app      ─┘              ├─ PostgreSQL  (all business data)
                                   ├─ Auth        (login, roles)
                                   ├─ Realtime    (live sync across offices)
                                   └─ Storage     (invoice PDFs, signatures)
```

There is **no separate API server**. Supabase exposes the Postgres schema over
HTTPS directly, so "the backend" is: **schema + RLS policies + RPC functions**.
Clients talk to the database only through `security definer` RPCs.

Three offices are in scope: Pune, Nashik, Mumbai.

---

## Backend — Supabase

| Layer | Choice | Notes |
|---|---|---|
| Database | **PostgreSQL** (Supabase-hosted) | Region **Mumbai (ap-south-1)**. Free tier for the demo; Pro **before** real inventory is entered (free tier has no backups). |
| Business logic | **PL/pgSQL functions** (`security definer`) | `scan_lookup`, `save_outward`, `save_inward` — signatures locked in [Contract.md](./Contract.md). |
| Auth | **Supabase Auth** | Email + password. Trigger on `auth.users` insert auto-creates the `profiles` row. |
| Authorization | **Row Level Security** | Enabled on every table, no exceptions. Reads scoped to the user's `office_id`; direct writes to `stock_ledger` / `stock_balances` denied to all roles. |
| Realtime | **Supabase Realtime** | Live stock sync across offices. |
| Files | **Supabase Storage** | Invoice PDFs, signatures (out of scope for Sprint 1). |
| Types | `supabase gen types typescript` | Generated into `packages/shared/database.types.ts` and **committed** — it is the compile-time contract for both clients. |
| Tooling | **Supabase CLI** (`npx supabase`) | Type generation; SQL editor used for RPC testing. |

### Core tables

`offices` · `profiles` · `products` · `product_barcodes` · `stock_ledger` · `stock_balances`

`stock_ledger` is **append-only and is the source of truth** — no `UPDATE`, no `DELETE`,
ever. Corrections are reversing entries (SRD §16). `stock_balances` is a rebuildable cache.

---

## Mobile app — React Native

| Layer | Choice |
|---|---|
| Framework | **React Native** via **Expo** (`create-expo-app`, TypeScript template) |
| Language | **TypeScript** |
| Data client | **`@supabase/supabase-js`** (RPC calls only) |
| Camera / scanning | **`expo-camera`** — `CameraView` + `barcodeScannerSettings` |
| Symbologies | `code128`, `ean13`, `upc_a`, `qr` |
| Auth storage | **`expo-secure-store`** as the Supabase auth storage adapter |
| Navigation | **`@react-navigation/native`** + native-stack |
| IDs | **`react-native-uuid`** — UUID v4 for `client_txn_id` |
| Feedback | **`expo-haptics`** (vibration + beep on scan) |
| Config | `app.config.ts` `extra` holds `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| Distribution | **EAS Build** → APK (`eas build -p android --profile preview`), direct install. No Play Store release. |

Development targets a **physical Android device** — emulator cameras can't scan.

---

## Desktop app — Electron

Three desktop `.exe` clients (one per office), referenced in [Plan.md](./Plan.md).
They hit the same Supabase RPCs over HTTPS with the anon key. Product creation is a
desktop responsibility; the mobile app only reports "barcode not found".

> **Proposed, not yet locked.** No document pins the desktop internals down. The choices
> below mirror the mobile stack (React + TypeScript) so `database.types.ts` and the RPC
> call sites are shared rather than rewritten. Confirm with Ram before Sprint 2.

### Frontend (renderer process)

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** | Same as mobile; compiles against the committed `database.types.ts`. |
| UI framework | **React 18** | Shares component patterns and RPC call shapes with the Expo app. |
| Bundler / dev server | **Vite** (`electron-vite`) | Fast HMR in the renderer; produces the production bundle Electron Builder packages. |
| Routing | **React Router** (hash history) | `file://` in production has no server, so hash routes — not browser history. |
| Data client | **`@supabase/supabase-js`** | RPC calls only. Never `.from('stock_ledger').insert()` — RLS denies it. |
| Server state | **TanStack Query** | Caching, retries, and invalidation for `scan_lookup` / balance reads. |
| Styling | **Tailwind CSS** | Dense data tables and forms; this is a keyboard-and-mouse data-entry app, not a phone. |

### Backend (main process)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node.js** (Electron main process) | Bundled inside Electron — no separate install. |
| Language | **TypeScript** | Compiled with the renderer via `electron-vite`. |
| Business logic | **None locally** | The backend is Supabase. The main process does windows, updates, printing, and secure token storage — **it is not an API server**. |
| Auth storage | **`safeStorage`** (Electron) or **`keytar`** | OS keychain-backed. The desktop equivalent of `expo-secure-store`. |
| Config | **`dotenv`** | `SUPABASE_URL` + **anon key only**. See the security note below. |
| Packaging | **`electron-builder`** | Produces the three office `.exe` installers (NSIS, Windows). |

**IPC boundary:** `contextIsolation: true`, `nodeIntegration: false`, with a `preload.ts`
exposing a narrow typed API over `contextBridge`. The renderer gets no direct Node access.

**Why "backend language" is a short answer here:** the desktop app has no backend of its
own. Its server-side language is **PL/pgSQL**, running inside Supabase — the same three
RPCs the mobile app calls. Anything in the Electron main process is desktop plumbing.

> ⚠️ Recall the Plan.md warning: an Electron app is a ZIP of JavaScript. `npx asar extract`
> reads every string in it in thirty seconds. A `.env` bundled into the `.exe` is a public
> `.env` — anon key only, never a connection string, never `service_role`.

---

## Security model

This is the part the project is most opinionated about:

- **Never** ship a direct Postgres connection string in a client. An Electron app is a
  ZIP of JavaScript — `npx asar extract` reveals every string in it within thirty seconds.
- **Never** put the `service_role` key in the app, the repo, or any shared `.env`.
  It bypasses RLS entirely.
- The **anon key is public by design** and is fine to ship.
- All credentials live in the database; RLS is the enforcement boundary.
- Clients never write tables directly — `security definer` RPCs are the only write path.
- Client-side stock validation is **UX, not security**. The server re-validates.

### Two mechanisms worth calling out

**Concurrency** — `save_outward` does `SELECT ... FOR UPDATE` on the balance row inside
one transaction. Without it, two offices racing on the same product corrupt the count.
Test: two concurrent outwards on 1 unit of stock → exactly one succeeds.

**Idempotency** — every write RPC takes a `client_txn_id` (UUID v4), stored under a
`UNIQUE` constraint on `stock_ledger`. The device generates it **once per form
submission** (on mount, in a `useRef`) and reuses it across retries; the RPC returns the
original result rather than writing a second row. Generating a fresh id in the submit
handler silently defeats the whole mechanism.

---

## Repository layout

```
Document/           # SRD, sprint plans, RPC contract  ← everything today
  Contract.md       # locked RPC signatures (backend ↔ frontend source of truth)
  Plan.md           # architecture + security notes
  m.md              # Sprint 1 backend tasks (Mahim)
  s.md              # Sprint 1 frontend tasks (Shrusti)
  Software Requirement Document (SRD) - Inventory Management.pdf
README.md
```

`packages/shared/database.types.ts` is the one code path named so far — a monorepo
layout is implied but not yet created.

---

## Team

| Area | Owner |
|---|---|
| Supabase schema, RLS, RPCs | Mahim |
| Mobile app (Expo / React Native) | Shrusti |
| Desktop app | Ram |

---

## Installation — verified

> Every command below was run against this repo on **16 Jul 2026** (Windows 11, npm workspaces).
> `npm run typecheck` and `npm run build` both pass on the result. Versions are the ones
> actually installed, not `latest` — see **Version pins that matter** for why some are pinned.

### Fresh clone — the whole thing

```bash
git clone <repo> && cd Siddesh-ERP
npm install          # installs all workspaces (root, apps/desktop, packages/shared)
cp .env.example .env # then fill in the URL + anon key from Mahim
npm run dev          # Electron opens with HMR
```

That is the entire install. `npm install` at the root covers every workspace — do **not**
run `npm install` inside `apps/desktop`; it will fight the workspace hoisting.

### What each root script does

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `electron-vite dev` | Desktop app + renderer HMR |
| `npm run build` | `electron-vite build` | Compiles main, preload, renderer → `apps/desktop/out/` |
| `npm run package` | `electron-builder --win` | Produces the office `.exe` |
| `npm run typecheck` | `tsc --noEmit` (all workspaces) | CI gate |
| `npm run db:start` | `supabase start` | Local Postgres in Docker |
| `npm run db:types` | `supabase gen types typescript --local` | Regenerates `packages/shared/database.types.ts` (BE-19) |

### Installed dependency set

**Root** (`package.json`) — tooling shared by every workspace:

| Package | Version | Why |
|---|---|---|
| `supabase` | **`2.98.0` (pinned)** | CLI. **Do not bump past 2.98.0** — see below. |
| `typescript` | `^7.0.2` | One compiler version for the whole monorepo. |

**`apps/desktop`** — dependencies:

| Package | Version | Role |
|---|---|---|
| `react` / `react-dom` | `^19.2.7` | Renderer UI |
| `react-router-dom` | `^7.18.1` | Hash routing (see below) |
| `@tanstack/react-query` | `^5.101.2` | Server state, retries, cache invalidation |
| `@supabase/supabase-js` | `^2.110.6` | RPC bridge — the client SDK, not a backend |
| `keytar` | `^7.9.0` | OS keychain for the session token |
| `@siddesh/shared` | workspace | Generated DB types + RPC shapes |

**`apps/desktop`** — devDependencies:

| Package | Version | Role |
|---|---|---|
| `electron` | `^43.1.1` | Runtime |
| `electron-vite` | `^5.0.0` | Builds main + preload + renderer together |
| `electron-builder` | `^26.15.3` | Packages the `.exe` (NSIS) |
| `vite` | `^8.1.4` | Bundler |
| `@vitejs/plugin-react` | `^6.0.3` | JSX / Fast Refresh |
| `tailwindcss` + `@tailwindcss/vite` | `^4.3.2` | Styling (v4 — CSS-first) |
| `@types/react` / `@types/react-dom` | `^19.2.x` | React types |

### Version pins that matter

**`supabase` is pinned to `2.98.0` and must not be bumped.** From `2.99.0` onward the npm
package resolves its binary through `optionalDependencies` (`@supabase/cli-windows-x64`
et al.) — and **those packages are published on npm only as empty `1.0.0` stubs**. The
result on every platform, not just Windows:

```
Error: No matching Supabase CLI binary package found for win32-x64
```

`2.98.0` is the last release using the `postinstall` script that downloads the real binary
from GitHub. It works. If you need a newer CLI before upstream fixes this, install it
outside npm (Scoop on Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`)
and drop the devDependency.

**Tailwind is v4, so there is no `postcss`, `autoprefixer`, or `tailwind.config.js`.**
v4 uses the `@tailwindcss/vite` plugin and configures itself from CSS:

```css
/* apps/desktop/src/renderer/src/styles.css */
@import 'tailwindcss';
```

Theme tokens go in an `@theme { }` block in that file. Any v3-era tutorial telling you to
run `npx tailwindcss init -p` is wrong for this repo.

**TypeScript 7 removed `baseUrl`.** Path aliases must be relative:

```jsonc
// correct for TS7
"paths": { "@/*": ["./src/renderer/src/*"] }   // note the leading ./
```

**`react-router-dom` uses `createHashRouter`, not `createBrowserRouter`.** Production loads
over `file://`, where there is no server to resolve path routes.

### Database setup

```bash
npx supabase init      # once — creates supabase/config.toml
npm run db:start       # local Postgres (needs Docker Desktop running)
npm run db:types       # regenerate database.types.ts — commit the result
```

`npm run db:types` targets `--local`. To generate against the hosted project instead:

```bash
npx supabase gen types typescript --project-id <ref> > packages/shared/database.types.ts
```

### Mobile app — not yet installed

`apps/mobile/` is a placeholder. Per s.md FE-01:

```bash
cd apps/mobile
npx create-expo-app@latest . --template blank-typescript
npx expo install expo-camera expo-secure-store expo-haptics
npm install @supabase/supabase-js @react-navigation/native react-native-uuid
```

Then add `"apps/mobile"` to the root `workspaces` array. Expo and npm workspaces need
Metro config to resolve hoisted modules — budget time for that, it is not free.

---

## Directory structure

```
Siddesh-ERP/
├─ package.json                  # workspace root: scripts + supabase CLI + tsc
├─ .gitignore                    # node_modules, .env, out/, dist/
├─ .env.example                  # anon key only — copy to .env
│
├─ apps/
│  ├─ desktop/                   # Electron client (Ram)
│  │  ├─ package.json
│  │  ├─ electron.vite.config.ts # builds main + preload + renderer
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ main/index.ts        # Node — windows, printing, updates. NOT an API server.
│  │     ├─ preload/index.ts     # contextBridge — the only renderer→Node surface
│  │     └─ renderer/            # React app
│  │        ├─ index.html        # CSP locked to self + *.supabase.co
│  │        └─ src/
│  │           ├─ main.tsx       # hash router + QueryClient
│  │           ├─ App.tsx
│  │           ├─ env.d.ts       # types for import.meta.env
│  │           ├─ styles.css     # @import 'tailwindcss'
│  │           ├─ lib/supabase.ts
│  │           ├─ routes/        # ← screens go here
│  │           └─ components/
│  │
│  └─ mobile/                    # Expo app (Shrusti) — not scaffolded yet
│
├─ packages/
│  └─ shared/                    # imported by BOTH clients
│     ├─ index.ts                # RPC result types, OutwardType, INSUFFICIENT_STOCK
│     └─ database.types.ts       # generated — BE-19 replaces the placeholder
│
├─ supabase/
│  ├─ migrations/                # schema as versioned SQL
│  └─ seed.sql                   # BE-20 demo products
│
└─ Document/                     # SRD, sprint plans, contract, this file
```

### Why a monorepo

`packages/shared/database.types.ts` is named in BE-19 as the artifact both clients compile
against. That only works if both can import it — hence npm workspaces. The alternative
(copying the file into two repos) means the two clients silently drift apart the first time
the schema changes, which is exactly the failure Contract.md exists to prevent.

### Where the security boundaries live

Three files carry the rules the rest of the docs describe, worth reading before touching:

- **`src/main/index.ts`** — `contextIsolation: true`, `nodeIntegration: false`. Not defaults
  to tweak away; the renderer ships to three offices and gets no direct Node access.
- **`src/renderer/index.html`** — CSP restricts `connect-src` to `*.supabase.co`. A
  compromised renderer cannot exfiltrate to an arbitrary host.
- **`.env.example`** — anon key only. Everything in `.env` is bundled into the `.exe` and
  readable via `npx asar extract`. Never a `service_role` key, never a connection string.
