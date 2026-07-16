/// <reference types="vite/client" />

import type { DesktopApi } from '../../preload'

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    /** Exposed by the preload script via contextBridge. See src/preload/index.ts. */
    api: DesktopApi
  }
}
