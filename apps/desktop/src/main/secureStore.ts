import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * OS-encrypted key/value store for the Supabase session token.
 *
 * Why this exists: the renderer must never hold auth tokens in localStorage. On a shared
 * office PC that file is world-readable plaintext, and any renderer-side XSS can read it.
 * `safeStorage` encrypts against the OS credential store (DPAPI on Windows), so the token
 * at rest is tied to the logged-in Windows user.
 *
 * Chosen over `keytar` deliberately: keytar is a native module needing a rebuild per
 * Electron version, and `safeStorage` is built in with no build step.
 */

/** One file per key, under Electron's per-user userData directory. */
function pathFor(key: string): string {
  // Key is developer-supplied, never user input, but sanitise anyway so a key can never
  // escape userData via path traversal.
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_')
  return join(app.getPath('userData'), 'secure', `${safeKey}.dat`)
}

/**
 * Reads and decrypts a value.
 *
 * @returns The stored string, or null when absent or undecryptable.
 *
 * Returns null rather than throwing on a decryption failure: that happens legitimately when
 * the Windows profile changed, and the correct response is "log in again", not a crash.
 */
export async function getSecure(key: string): Promise<string | null> {
  const file = pathFor(key)
  if (!existsSync(file)) return null

  try {
    const encrypted = await readFile(file)
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(encrypted)
  } catch {
    // Corrupt or written by a different OS user — treat as "no session".
    return null
  }
}

/**
 * Encrypts and stores a value.
 *
 * @throws When OS encryption is unavailable — callers must not silently fall back to
 *         plaintext, which would defeat the entire point of this module.
 */
export async function setSecure(key: string, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption unavailable; refusing to store the session in plaintext')
  }

  const file = pathFor(key)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, safeStorage.encryptString(value))
}

/** Removes a value. Absent keys are not an error — logout must always succeed. */
export async function removeSecure(key: string): Promise<void> {
  const file = pathFor(key)
  if (!existsSync(file)) return

  try {
    await unlink(file)
  } catch {
    // Already gone, or locked by AV. Either way the user is logged out.
  }
}
