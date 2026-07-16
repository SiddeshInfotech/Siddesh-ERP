import { contextBridge, ipcRenderer } from 'electron'

/**
 * The only surface the renderer gets onto Node.
 *
 * Keep it narrow and typed — every function added here is attack surface for the renderer.
 * Nothing here accepts a path, a command, or a filesystem handle: only opaque string keys
 * the main process resolves itself.
 */
const api = {
  platform: process.platform,

  /** OS-encrypted storage for the auth session. Backed by Electron `safeStorage`. */
  secureStore: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-store:get', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('secure-store:set', key, value),
    remove: (key: string): Promise<void> => ipcRenderer.invoke('secure-store:remove', key)
  },

  /**
   * Recolours the native window buttons to match the app theme.
   * Windows draws them itself, so they cannot read our CSS variables.
   */
  setTitleBarTheme: (theme: { color: string; symbolColor: string }): Promise<void> =>
    ipcRenderer.invoke('window:set-title-bar-theme', theme)
} as const

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
