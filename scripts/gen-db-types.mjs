/**
 * Regenerates packages/shared/database.types.ts from the hosted Supabase project.
 *
 * Why this exists rather than a one-line npm script: the Supabase CLI reads its credential
 * from the SUPABASE_ACCESS_TOKEN environment variable, but ours lives in .env, and npm does
 * not load .env. This bridges the two so `npm run db:types` works from a clean shell.
 *
 * Cloud dev needs no Docker (Document/Tech-Stack.md), so this targets --project-id, never
 * --local. The project ref is derived from VITE_SUPABASE_URL, which every developer already
 * has; it is public and ships in the .exe, so it is not a secret. The access token IS a
 * secret and stays in .env, which is gitignored.
 *
 * Usage: npm run db:types
 */

import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env')
const OUT_FILE = join(ROOT, 'packages', 'shared', 'database.types.ts')

/** Exits with a readable instruction rather than a stack trace. */
function fail(message) {
  console.error(`\ndb:types — ${message}\n`)
  process.exit(1)
}

if (!existsSync(ENV_FILE)) {
  fail('No .env at the repo root. Copy .env.example to .env and fill it in.')
}
process.loadEnvFile(ENV_FILE)

const url = process.env.VITE_SUPABASE_URL
const token = process.env.SUPABASE_ACCESS_TOKEN

if (!url) fail('VITE_SUPABASE_URL is not set in .env.')
if (!token) {
  fail(
    'SUPABASE_ACCESS_TOKEN is not set in .env.\n' +
      'Create one at https://supabase.com/dashboard/account/tokens, then add:\n' +
      '  SUPABASE_ACCESS_TOKEN=sbp_...\n' +
      'Do NOT prefix it with VITE_ — that would bundle it into the renderer.'
  )
}

// https://<ref>.supabase.co -> <ref>
const ref = new URL(url).hostname.split('.')[0]

// Validate before it reaches a command line. A project ref is 20 lowercase letters; anything
// else means .env is malformed, and passing it through unchecked is how a stray shell
// metacharacter turns a build script into arbitrary execution.
if (!/^[a-z]{20}$/.test(ref)) {
  fail(`VITE_SUPABASE_URL does not look like a Supabase project URL (parsed ref: "${ref}").`)
}

console.log(`db:types — generating from project ${ref}…`)

// Call the CLI's real binary, not `npx` / the .bin shim. Node 24 refuses to spawn a Windows
// .cmd without shell:true, and shell:true concatenates argv into a single string — so the
// convenient path is also the injectable one. A direct binary needs no shell either way.
const bin = join(
  ROOT,
  'node_modules',
  'supabase',
  'bin',
  process.platform === 'win32' ? 'supabase.exe' : 'supabase'
)
if (!existsSync(bin)) fail('The supabase CLI is not installed. Run `npm install` at the root.')

// stdio 'pipe' on stdout so the types do not leak into the terminal; stderr passes through
// so CLI errors stay visible.
const types = execFileSync(
  bin,
  ['gen', 'types', 'typescript', '--project-id', ref],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: false }
)

// A failed generation can still exit 0 with an empty body; writing that would silently
// replace the schema with nothing and break every typed query in both clients.
if (!types.includes('export type Database')) {
  fail('The CLI returned no schema. Nothing was written.')
}

writeFileSync(OUT_FILE, types)
console.log(`db:types — wrote ${types.split('\n').length} lines to packages/shared/database.types.ts`)
