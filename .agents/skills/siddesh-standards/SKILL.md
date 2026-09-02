---
name: siddesh-standards
description: The engineering rule book for the Siddesh ERP project — security, reliability, performance, naming, error handling, edge cases, Apple-grade UI, and the append-only work log. Load this BEFORE writing or editing any line of code, config, or SQL in this repo.
---

# Siddesh ERP — Engineering Rule Book

Every line of code in this repo follows this document. If a rule here conflicts with a
habit, the rule wins. If a rule here is wrong, change the rule in a commit — do not quietly
ignore it.

**Stack:** Electron + React 19 + TypeScript 7 + Vite 8 + Tailwind 4 → Supabase (Postgres).

---

## 0. Non-negotiables — break these and the build is wrong

These are not style. They are the reasons this system can be trusted with real inventory.

1. **Anon key only in the client.** Never the `service_role` key, never a `postgresql://`
   connection string. The `.exe` is a ZIP of JavaScript — `npx asar extract` reads every
   string in it in thirty seconds. Anything in `.env` ships to three offices, publicly.
2. **Never write `stock_ledger` or `stock_balances` directly.** No
   `.from('stock_ledger').insert()`. RLS denies it *by design*. All writes go through the
   `security definer` RPCs: `save_inward`, `save_outward`.
3. **The ledger is append-only.** No UPDATE, no DELETE, ever. Corrections are reversing
   entries. A ledger row that can be edited is not an audit trail.
4. **Client-side validation is UX, not security.** The server re-validates every time. Never
   trust the client for stock math.
5. **`client_txn_id` is generated once per form submission**, on mount, in a `useRef` — not
   in the submit handler. A new id per retry silently defeats idempotency and double-deducts
   stock.
6. **`contextIsolation: true`, `nodeIntegration: false`.** Not defaults to tweak away.
7. **Stock is derived, never stored as an editable field.** Read it from the ledger.

---

## 1. Security

- **Secrets never reach the renderer.** Only `VITE_`-prefixed vars are exposed, and only the
  Supabase URL + anon key qualify. Anything secret belongs server-side (Postgres/RPC).
- **CSP stays locked** in `index.html`: `connect-src` limited to `self` + `*.supabase.co`.
  Never widen it to `*` to "fix" a request — fix the request.
- **Never build SQL by string concatenation.** Parameters only, always.
- **Never log secrets, tokens, or full user records.** Log ids, not payloads.
- **Session tokens live in the OS keychain** (Electron `safeStorage` / `keytar`), never in
  `localStorage`.
- **External links open via `shell.openExternal`**, never in an Electron window.
- **Validate every input at the boundary** (form → RPC), and again in Postgres via `CHECK`.
- **RLS is the security boundary.** If a query returns data it shouldn't, the policy is
  broken — do not paper over it in the UI.

---

## 2. Reliability & error handling

### try/catch — catch only where you can act

Do **not** wrap everything in `try/catch`. A catch that logs and continues turns a loud bug
into a silent corruption. Catch only when you will genuinely do one of:

1. recover (retry, fall back),
2. add context and rethrow,
3. present it to the user.

Otherwise let it reach an error boundary.

```ts
// ❌ swallows the failure — stock is now wrong and nobody knows
try { await saveOutward(input) } catch (e) { console.log(e) }

// ✅ act, or let it propagate
try {
  await saveOutward(input)
} catch (error) {
  if (isInsufficientStock(error)) return showMessage(`Only ${available} left in stock`)
  throw error   // unknown failure — the boundary handles it
}
```

### Errors: generic to the user, specific in the log

Both halves matter. Generic-only means nobody can debug it; specific-only leaks internals.

```ts
// ✅
logger.error('save_outward failed', { productId, clientTxnId, code: error.code })
showMessage('Could not save. Please try again.')   // no stack, no SQL, no ids
```

- **Never** surface a raw Postgres error to a storekeeper.
- **Always** parse the known ones: `error.message.startsWith('INSUFFICIENT_STOCK')` →
  "Only X left in stock".
- Every async UI action has **three** states, not two: success, *known* failure, *unknown*
  failure with a Retry.

### Supabase returns errors, it does not throw

```ts
const { data, error } = await supabase.rpc('scan_lookup', { p_code })
if (error) throw error          // network/server failure
if (!data.found) return notFound()   // ← NOT an error. found:false arrives with error:null
```

Branch on `data.found`, never on `error`, for not-found.

### Other rules

- **React error boundary** at the app root. A white screen is never acceptable.
- **Disable submit buttons while in flight.** A double-tap is a double-outward.
- **Every mutation is idempotent** via `client_txn_id`.
- **No empty `catch {}`. No `// eslint-disable` without a one-line reason.**

---

## 3. Performance

- **Never fetch in a loop.** One query with `in`, or one RPC. N+1 kills the product list.
- **TanStack Query owns server state.** No manual `useEffect` + `useState` fetching.
- Set `staleTime` deliberately. Stock is live data — keep it short; the product list is not.
- **Index every column you filter or sort by** (see `Document/database.md` §9).
- **Paginate any list that can grow** — ledger and reports especially. Never `select('*')`
  on an unbounded table.
- `select()` the columns you need, not `*`, on hot paths.
- **Memoize only measured hot paths.** `useMemo` everywhere is noise, not speed.
- Keep the renderer bundle lean; prefer built-ins over a library for one function.
- Long lists (ledger, products) get virtualization past ~200 rows.

---

## 4. Naming & files

| Thing | Convention | Example |
|---|---|---|
| Component file | `PascalCase.tsx` | `ProductTable.tsx` |
| Hook file | `useCamelCase.ts` | `useScanLookup.ts` |
| Util / lib file | `camelCase.ts` | `formatBarcode.ts` |
| Type-only file | `camelCase.types.ts` | `outward.types.ts` |
| SQL migration | `NNN_snake_case.sql` | `06_rpc.sql` |
| Folder | `kebab-case` | `product-master/` |
| Component / Type | `PascalCase` | `OutwardForm`, `ScanLookupResult` |
| Variable / function | `camelCase` | `availableQty`, `saveOutward()` |
| Constant | `UPPER_SNAKE_CASE` | `INSUFFICIENT_STOCK` |
| Boolean | `is` / `has` / `can` prefix | `isSaving`, `hasStock` |
| Event handler | `handle` prefix | `handleSubmit` |
| DB table / column | `snake_case` | `stock_ledger`, `balance_after` |

- **Names say what, not how.** `availableQty` not `qty2`. No abbreviations except `id`,
  `qty`, `txn`.
- **One component per file.** The file is named after it.
- **No default exports** except route/page components. Named exports refactor safely.

---

## 5. Separation of concerns

Four layers. A layer never reaches past its neighbour.

```
routes/      → screens. Layout + composition only. No SQL, no business rules.
components/  → dumb, reusable UI. Props in, events out. No data fetching.
hooks/       → server state + logic. The ONLY place supabase.rpc() is called.
lib/         → pure helpers (formatting, parsing). No React, no I/O.
```

- **A component never calls `supabase` directly.** It calls a hook.
- **A hook never renders.** It returns data and callbacks.
- **`lib/` is pure** — same input, same output, no side effects, trivially testable.
- **Business rules belong in Postgres**, not in React. If the UI decides whether stock is
  sufficient, the rule now lives in two places and they will drift.

---

## 6. Modern syntax — with judgement

Prefer modern constructs **where they improve clarity**. Clarity outranks brevity every time.

```ts
// ✅ ternary for simple value selection
const label = isSaving ? 'Saving…' : 'Save'

// ❌ nested ternaries — unreadable, banned
const s = a ? (b ? 'x' : c ? 'y' : 'z') : 'w'

// ✅ multi-branch → early return or a lookup map
const MESSAGES: Record<OutwardType, string> = { SALE: 'Sold', DEMO: 'On demo', /* … */ }
```

**Rule:** ternary for *values*. `if` / early return for *control flow*. Never nest a ternary.
Three or more branches → lookup map or `switch`.

Use freely:
- `?.` optional chaining, `??` nullish coalescing (`??` not `||` — `0` is valid stock!)
- Guard clauses / early return over `else` pyramids
- `const` by default; `let` only when reassigned; never `var`
- Destructuring, spread, template literals
- `async/await`, never raw `.then()` chains
- `Array.map/filter/reduce` over index loops — but a plain `for` when it reads better
- Discriminated unions over boolean flags

Never:
- `any`. Use `unknown` + a narrow. `any` disables the one tool that catches these bugs.
- `@ts-ignore` without a reason comment.
- `==`. Always `===`.
- `!` non-null assertion on anything from the network.

> **`||` vs `??` is a real bug here:** `qty || 10` turns a legitimate `0` into `10`.
> Use `??`.

**"Low code" means fewer moving parts, not fewer characters.** Delete duplication; never
compress a clear ten lines into a cryptic three.

---

## 7. Functions & comments

- **Small and single-purpose.** If you need "and" to describe it, split it.
- **Max ~3 params**; more → an options object.
- **Return early.** Max nesting depth 3.
- **Pure where possible.** Side effects at the edges.

### Comments — the contract and the why, never the what

Every **exported** function gets a JSDoc block stating its contract. Private one-liners do
not need ceremony.

```ts
/**
 * Saves an outward movement and reduces stock.
 *
 * @param input - Form values. `clientTxnId` MUST be stable across retries.
 * @returns The new balance after the movement.
 * @throws INSUFFICIENT_STOCK when available < qty (server-decided, never client).
 *
 * Idempotent: the same clientTxnId returns the original result without a second
 * ledger row. See Document/Contract.md.
 */
export async function saveOutward(input: OutwardInput): Promise<SaveResult> {}
```

Inline comments state a constraint the code cannot show:

```ts
// ✅ explains a non-obvious constraint
// Hash history: production loads over file://, where path routes have no server.
const router = createHashRouter(routes)

// ❌ narrates the obvious — delete it
// increment the counter
count++
```

Never write comments about the change itself ("fixed bug", "new code", "as requested").
They are noise the moment the PR merges.

---

## 8. Imports — sequential and grouped

Blank line between groups, alphabetical within a group.

```ts
// 1. Node builtins
import { join } from 'node:path'

// 2. External packages
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

// 3. Internal workspace packages
import type { ScanLookupResult } from '@siddesh/shared'

// 4. Local — absolute alias before relative
import { Button } from '@/components/Button'
import { useScanLookup } from '@/hooks/useScanLookup'

// 5. Relative
import { formatBarcode } from './formatBarcode'

// 6. Styles last
import './styles.css'
```

`import type` for types — always. No unused imports. No circular imports.

---

## 9. Edge cases — cover them for every feature

A feature is not done when the happy path works. For **every** function, walk this list and
handle or consciously reject each:

**Data**
- [ ] empty (0 rows / `[]`) — does the UI show "no results", not a blank box?
- [ ] `null` / `undefined` from the network
- [ ] `0` — a real value, not "falsy" (stock, qty, price)
- [ ] one item, and very many (1,000 rows — still fast?)
- [ ] very long strings (a 200-char product name — does the layout break?)
- [ ] unicode / Marathi text, and leading/trailing spaces in scans

**Numbers**
- [ ] negative, zero, decimal where an integer is required
- [ ] qty > available (the whole point of `save_outward`)
- [ ] integer overflow on a mistyped 999999999

**Async**
- [ ] slow network (is there a spinner?)
- [ ] offline / airplane mode (error + Retry, exactly one ledger row)
- [ ] double-click submit (button disabled?)
- [ ] two users, same product, same second (server lock decides)
- [ ] request resolves after unmount (no setState on a dead component)

**Auth**
- [ ] session expired mid-action
- [ ] logged out in another window
- [ ] user lacks permission (RLS returns 0 rows — is that "empty" or "denied"?)

**Domain**
- [ ] barcode not found → *offer to create*, not an error (SRD §13)
- [ ] duplicate barcode on save
- [ ] damaged label → manual entry fallback exists
- [ ] scanner fires 10×/sec → exactly one lookup

Every one of these has a defined behaviour before the task is called done.

---

## 10. Design — Apple-grade, adapted for a data tool

The target is Apple's *restraint and craft*, not a copy of macOS. Remember who uses this: a
storekeeper scanning boxes, often standing, often in a hurry. **Clarity beats beauty; both
beat decoration.**

**Principles**
- **Deference.** The content is the product. Chrome recedes.
- **Clarity.** One primary action per screen. If everything is emphasised, nothing is.
- **Depth through subtlety.** Soft shadows and layering, never heavy borders.
- **Honest feedback.** Every action visibly acknowledges itself within 100ms.

**Concretely**
- **Spacing:** an 8px grid. Generous whitespace — it is structure, not waste.
- **Type:** one family (system UI stack). Max 3 sizes per screen. Weight and colour create
  hierarchy, never ALL-CAPS or exclamation marks.
- **Colour:** near-neutral canvas, one accent. Colour means something — it is never
  decoration. Red only for destructive/error, green only for success.
- **Motion:** 150–250ms, ease-out. Purposeful only. No bouncing.
- **Corners:** consistent radius (8px controls / 12px cards).
- **Density:** this is a data tool. Tables stay tight and scannable — Apple restraint applies
  to *chrome and colour*, not to whitespace inside a 500-row table.
- **The scanned number is the hero.** Available quantity is the largest thing on the result
  screen — the user is looking at a box, not the screen.
- **Empty, loading, and error states are designed**, never an afterthought. No blank white
  screens, no layout shift on load (skeletons match final dimensions).
- **Tailwind v4 is CSS-first.** Tokens go in `@theme {}` in `styles.css`. There is no
  `tailwind.config.js`. Never hardcode a hex in a component.

**Accessibility is not optional**
- Every input has a real `<label>`. Placeholders are not labels.
- Full keyboard operation — this app is used with a scanner and a keyboard, rarely a mouse.
- Visible focus rings. Never `outline: none` without a replacement.
- Contrast ≥ 4.5:1. Never colour alone to convey meaning.
- Hit targets ≥ 44px.

---

## 11. The work log — append only

**File:** `Document/WORKLOG.md`

- Append an entry for every task started and completed. **Never edit or delete an entry** —
  same rule as the stock ledger, and for the same reason: a log that can be rewritten is not
  a record.
- Corrections are a **new entry** referencing the old one.
- Every entry carries **date and time** (`DD/MM/YYYY HH:MM`, 24h, IST).
- Newest entries at the bottom.

```markdown
## 16/07/2026 14:30 — DSK-110 — Login works — Ram
**Status:** Done
**What:** Connected login to Supabase Auth; wrong password shows a clear message.
**Notes:** Session persists via safeStorage.
**Files:** apps/desktop/src/renderer/src/routes/Login.tsx
```

---

## 12. Project gotchas — these will bite

| Trap | Rule |
|---|---|
| `supabase` CLI | **Pinned to 2.98.0.** 2.99.0+ resolves its binary via optionalDeps that are empty stubs on npm → "No matching binary". Do not bump. |
| TypeScript 7 | `baseUrl` was **removed**. Paths must be relative: `"@/*": ["./src/renderer/src/*"]`. |
| Tailwind 4 | No `postcss`, no `autoprefixer`, no `tailwind.config.js`. Config is CSS-first. |
| Router | `createHashRouter`. Production is `file://` — browser history has no server. |
| Install | `npm install` at the **root** only. Never inside `apps/desktop` — it fights workspace hoisting. |
| `.env` | Restart `npm run dev` after editing. Vite reads it only at startup. |
| Docker | **Not needed.** Only for local Supabase. Cloud dev needs no container. |
| `database.types.ts` | **Generated** — never hand-edit. Regenerate with `npm run db:types`. |
| Contract.md | Locked. Change it *before* the code, and tell the group. |

---

## 13. Definition of done

A task is done only when **all** of these are true:

- [ ] Happy path works, verified by running it — not by assuming
- [ ] §9 edge cases handled or consciously rejected
- [ ] Loading, empty, and error states exist
- [ ] `npm run typecheck` passes; no `any`, no `@ts-ignore`
- [ ] `npm run build` passes
- [ ] No secret, key, or connection string added to client code
- [ ] Exported functions documented (§7)
- [ ] Keyboard-operable; labels present
- [ ] `Document/WORKLOG.md` appended with date + time

---

## 14. Rules of engagement

1. **Read before you write.** Match the file's existing style.
2. **Smallest change that solves it.** No drive-by refactors in a feature commit.
3. **Never fabricate.** If unsure whether an API exists, check. A confident wrong answer
   costs more than a question.
4. **Report failures honestly.** If tests fail, say so with the output. If a step was
   skipped, say that.
5. **Delete dead code.** Version control remembers it; the next reader should not have to.
6. **Fix the cause, not the symptom.** Never skip a hook or silence a check to get green.
