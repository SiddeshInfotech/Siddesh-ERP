import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { getSecure, removeSecure, setSecure } from './secureStore'

/** IPC channel names. Shared with the preload script — keep the two in step. */
const IPC = {
  secureGet: 'secure-store:get',
  secureSet: 'secure-store:set',
  secureRemove: 'secure-store:remove',
  setTitleBarTheme: 'window:set-title-bar-theme'
} as const

/** Height of the custom title bar. MUST equal the TopBar's h-12 (48px) in the renderer,
 *  or the native buttons sit off-centre against our own bar. */
const TITLE_BAR_HEIGHT = 48

/** Matches --color-background (dark) in styles.css. */
const DEFAULT_TITLE_BAR = { color: '#09090b', symbolColor: '#e5e1e4' }

/** Only hex colours reach the Windows compositor — never pass a string through unchecked. */
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

/**
 * Registers the only privileged operations the renderer may request.
 *
 * Deliberately narrow. Every handler added here is attack surface for a compromised
 * renderer, so this list should stay short and every input validated.
 */
function registerIpcHandlers(): void {
  ipcMain.handle(IPC.secureGet, (_event, key: string) => getSecure(key))
  ipcMain.handle(IPC.secureSet, (_event, key: string, value: string) => setSecure(key, value))
  ipcMain.handle(IPC.secureRemove, (_event, key: string) => removeSecure(key))

  // Repaints the Windows-drawn caption buttons when the user flips the theme. Without
  // this the top-right corner keeps the old background and the seam is obvious.
  ipcMain.handle(
    IPC.setTitleBarTheme,
    (event, theme: { color?: unknown; symbolColor?: unknown }) => {
      if (!isHexColor(theme?.color) || !isHexColor(theme?.symbolColor)) {
        throw new Error('setTitleBarTheme expects { color, symbolColor } as #rrggbb')
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      // setTitleBarOverlay throws if the window was not created with titleBarStyle:'hidden'
      // (i.e. on macOS/Linux). Guard rather than crash the main process.
      if (!win || process.platform !== 'win32') return

      win.setTitleBarOverlay({
        color: theme.color,
        symbolColor: theme.symbolColor,
        height: TITLE_BAR_HEIGHT
      })
    }
  )
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100, // below this the 208px sidebar + a data table stop fitting
    minHeight: 700,
    show: false, // revealed on ready-to-show to avoid a white flash
    autoHideMenuBar: true,
    backgroundColor: DEFAULT_TITLE_BAR.color, // prevents a white flash before first paint
    icon,
    // Hides the OS title bar (its icon, "Siddesh ERP" text, and its own grey background)
    // while KEEPING the native minimise/maximise/close buttons, drawn over our own
    // background colour. The alternative — frame:false — would mean reimplementing those
    // three buttons, and hand-rolled ones never behave quite like the real Windows
    // controls (snap layouts on maximise hover, double-click-to-restore, accessibility).
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { ...DEFAULT_TITLE_BAR, height: TITLE_BAR_HEIGHT }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Both are load-bearing security settings, not defaults to tweak away.
      // The renderer ships to three offices; it gets no direct Node access.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    win.maximize()
  })

  // External links open in the real browser, never in an Electron window. An in-app window
  // would have no address bar, so the user could not tell where they were.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-place navigation away from the app. Without this, a stray link turns the
  // window into an unbounded browser with our preload attached.
  win.webContents.on('will-navigate', (event, url) => {
    const isDevServer = process.env.ELECTRON_RENDERER_URL
      ? url.startsWith(process.env.ELECTRON_RENDERER_URL)
      : false
    if (!isDevServer && !url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
