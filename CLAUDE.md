# Siddesh ERP

Inventory management for Siddesh Technologies — three offices (Pune, Nashik, Mumbai).
Electron + React desktop client and an Expo mobile client, both talking to Supabase.

## Read this first

**Before writing or editing any line of code, config, or SQL in this repo, load the
`siddesh-standards` skill.** It is the engineering rule book: security, reliability,
performance, naming, error handling, edge cases, design, and the append-only work log.
It is not optional and it is not a style guide — rules 0.1 through 0.7 are the reasons this
system can be trusted with real inventory.

## Key documents

| File | What it is |
|---|---|
| `Document/database.md` | Full DB architecture, every table + relationship, from the SRD |
| `Document/Contract.md` | **Locked** RPC signatures — change this before the code, and tell the group |
| `Document/Tech-Stack.md` | Verified install, versions, directory structure |
| `Document/WORKLOG.md` | Append-only task log. Never edit an entry |
| `Document/Ram-Desktop-Sprint-4days.tsv` | The 4-day desktop sprint |

## Commands

```bash
npm install        # root only — never inside apps/desktop
npm run dev        # Electron + HMR
npm run build      # compiles main, preload, renderer
npm run typecheck  # all workspaces
npm run db:types   # regenerate packages/shared/database.types.ts
```

## The seven things that matter most

1. Anon key only in the client. Never `service_role`, never a connection string — the `.exe`
   is a ZIP anyone can unpack.
2. Never write `stock_ledger` / `stock_balances` directly. Use the `security definer` RPCs.
3. The ledger is append-only. Corrections are reversing entries.
4. Client-side validation is UX, not security. The server decides.
5. `client_txn_id` is generated once per submission, on mount — not per retry.
6. `contextIsolation: true`, `nodeIntegration: false`.
7. Stock is derived from the ledger, never stored as an editable field.

## Gotchas that will bite

- `supabase` CLI is **pinned to 2.98.0** — 2.99.0+ is broken on npm (binary packages are
  empty stubs). Do not bump.
- TypeScript 7 **removed `baseUrl`** — paths must be relative.
- Tailwind 4 is CSS-first — no `postcss`, no `autoprefixer`, no `tailwind.config.js`.
- Use `createHashRouter` — production loads over `file://`.
- Docker is **not** needed. Only for local Supabase; cloud dev needs no container.
- Restart `npm run dev` after editing `.env` — Vite reads it only at startup.
