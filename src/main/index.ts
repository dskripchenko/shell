/**
 * The main process: the window (and the drop-down one), the shells, the
 * settings and the last session — everything the window may not touch itself.
 */
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell as electronShell, type WebContents } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { toAccelerator, type Platform } from '../common/keys'
import { allPanes, type Workspace } from '../common/layout'
import { IPC, type Settings, type Startup } from '../common/ipc'
import { dataDir } from './dataDir'
import { gitBranch, processCwd } from './probe'
import { Ptys } from './pty'
import { SessionStore, type Bounds } from './session'
import { SettingsStore } from './settings'

const DATA = dataDir({ env: process.env, platform: process.platform, execPath: process.execPath, packaged: app.isPackaged, cwd: process.cwd() })
// Chromium's own files too: nothing in the user's profile.
app.setPath('userData', DATA)
app.setPath('sessionData', join(DATA, 'chromium'))
app.setPath('logs', join(DATA, 'logs'))
app.setPath('crashDumps', join(DATA, 'crashes'))

const E2E = process.env.SHELL_E2E === '1'
const PLATFORM: Platform = process.platform === 'darwin' ? 'mac' : 'other'
const VERSION = app.getVersion()

if (!app.requestSingleInstanceLock()) app.quit()

type Kind = 'main' | 'quake'

interface Host {
  kind: Kind
  window: BrowserWindow
  session: SessionStore
  ptys: Ptys
  workspace: Workspace | null
  replay: Record<string, string>
}

const hosts = new Map<number, Host>()
let settings: SettingsStore
let mainHost: Host | null = null
let quakeHost: Host | null = null

function hostOf(contents: WebContents): Host | undefined {
  return hosts.get(contents.id)
}

function send(host: Host, channel: string, ...args: unknown[]): void {
  if (!host.window.isDestroyed()) host.window.webContents.send(channel, ...args)
}

function tailLimit(s: Settings): number {
  return s.config.scrollback.restore ? s.config.scrollback.restoreKb * 1024 : 0
}

function createHost(kind: Kind): Host {
  const session = new SessionStore(DATA, kind === 'main' ? 'session' : 'session-quake')
  const bounds = kind === 'main' ? session.bounds() : null
  const quake = kind === 'quake'
  const window = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 560,
    minHeight: 360,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#fafafa',
    title: 'shell',
    ...(quake
      ? { frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false, fullscreenable: false }
      : PLATFORM === 'mac'
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 13 } }
        : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#2c2c2e', symbolColor: '#a1a1aa', height: 40 } }),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  const s = settings.get()
  const host: Host = {
    kind,
    window,
    session,
    ptys: new Ptys(
      {
        data: (paneId, data) => send(host, IPC.data, paneId, data),
        exit: (paneId, code) => send(host, IPC.exit, paneId, code),
      },
      VERSION,
      tailLimit(s),
    ),
    workspace: session.workspace(),
    replay: s.config.scrollback.restore ? session.readScrollback() : {},
  }
  if (!s.config.scrollback.restore) session.clearScrollback()
  for (const [id, text] of Object.entries(host.replay)) host.ptys.seed(id, text)
  hosts.set(window.webContents.id, host)

  // Links leave for the browser; nothing navigates the window away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void electronShell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (e) => e.preventDefault())

  if (bounds?.maximized) window.maximize()
  window.once('ready-to-show', () => {
    // Under test the window does not take the focus from the person working.
    if (quake) return
    if (E2E) window.showInactive()
    else window.show()
  })
  if (quake) window.on('blur', () => window.hide())
  const id = window.webContents.id
  window.on('close', () => {
    saveScrollback(host)
    if (kind === 'main') session.save({ bounds: boundsOf(window) })
  })
  window.on('closed', () => {
    host.ptys.killAll()
    hosts.delete(id)
    if (host === mainHost) {
      mainHost = null
      // Elsewhere closing the main window ends shell, the hidden drop-down with it.
      if (PLATFORM !== 'mac') app.quit()
    }
    if (host === quakeHost) quakeHost = null
  })
  void window.loadFile(join(__dirname, 'renderer', 'index.html'), { query: quake ? { quake: '1' } : {} })
  return host
}

function boundsOf(w: BrowserWindow): Bounds {
  const b = w.isMaximized() || w.isFullScreen() ? w.getNormalBounds() : w.getBounds()
  return { ...b, maximized: w.isMaximized() }
}

function saveScrollback(host: Host): void {
  if (!settings.get().config.scrollback.restore || !host.workspace) return
  try {
    host.session.writeScrollback(host.ptys.tailsText(), new Set(allPanes(host.workspace).map((p) => p.id)))
  } catch {
    // The disk refused: the next start shows the panes empty.
  }
}

// The drop-down window ---------------------------------------------------------------------

function toggleQuake(): void {
  if (!quakeHost || quakeHost.window.isDestroyed()) quakeHost = createHost('quake')
  const w = quakeHost.window
  if (w.isVisible() && w.isFocused()) {
    w.hide()
    return
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const height = Math.round(area.height * settings.get().config.quake.height)
  w.setBounds({ x: area.x, y: area.y, width: area.width, height })
  w.show()
  w.focus()
}

function registerQuake(): string[] {
  globalShortcut.unregisterAll()
  const q = settings.get().config.quake
  if (!q.enabled) return []
  const accel = toAccelerator(q.hotkey, PLATFORM)
  if (!accel) return [`[quake] hotkey: «${q.hotkey}» не сочетание клавиш`]
  try {
    if (!globalShortcut.register(accel, toggleQuake)) return [`[quake] hotkey: «${q.hotkey}» занято другой программой`]
  } catch {
    return [`[quake] hotkey: «${q.hotkey}» не поддерживается системой`]
  }
  return []
}

// What the window asks ---------------------------------------------------------------------

function settingsWithShortcuts(): Settings {
  const s = settings.get()
  return { ...s, errors: [...s.errors, ...quakeErrors] }
}

let quakeErrors: string[] = []

ipcMain.handle(IPC.startup, (e): Startup | null => {
  const host = hostOf(e.sender)
  if (!host) return null
  return { platform: PLATFORM, quake: host.kind === 'quake', home: homedir(), workspace: host.workspace, replay: host.replay, settings: settingsWithShortcuts(), version: VERSION }
})

ipcMain.handle(IPC.spawn, (e, paneId: unknown, opts: unknown) => {
  const host = hostOf(e.sender)
  if (!host || typeof paneId !== 'string' || !opts || typeof opts !== 'object') return { ok: false, error: 'bad request' }
  const o = opts as { cwd?: unknown; cols?: unknown; rows?: unknown }
  const shell = settings.get().config.shell
  return host.ptys.spawn(paneId, {
    cwd: typeof o.cwd === 'string' ? o.cwd : undefined,
    cols: typeof o.cols === 'number' ? o.cols : 80,
    rows: typeof o.rows === 'number' ? o.rows : 24,
    shell: { program: shell.program, args: shell.args },
  })
})

ipcMain.on(IPC.write, (e, paneId: unknown, data: unknown) => {
  if (typeof paneId === 'string' && typeof data === 'string') hostOf(e.sender)?.ptys.write(paneId, data)
})

ipcMain.on(IPC.resize, (e, paneId: unknown, cols: unknown, rows: unknown) => {
  if (typeof paneId === 'string' && typeof cols === 'number' && typeof rows === 'number') hostOf(e.sender)?.ptys.resize(paneId, cols, rows)
})

ipcMain.on(IPC.kill, (e, paneId: unknown) => {
  if (typeof paneId === 'string') hostOf(e.sender)?.ptys.forget(paneId)
})

ipcMain.handle(IPC.cwd, async (e, paneId: unknown) => {
  const pid = typeof paneId === 'string' ? hostOf(e.sender)?.ptys.pid(paneId) : null
  return pid ? processCwd(pid) : null
})
ipcMain.handle(IPC.gitBranch, (_e, folder: unknown) => (typeof folder === 'string' && folder ? gitBranch(folder) : null))

let saveTimer: NodeJS.Timeout | null = null
ipcMain.on(IPC.saveWorkspace, (e, ws: unknown) => {
  const host = hostOf(e.sender)
  if (!host) return
  host.workspace = ws as Workspace
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      if (host.workspace) host.session.save({ workspace: host.workspace })
    } catch {
      // The disk refused: tried again at the next change.
    }
  }, 300)
})

ipcMain.on(IPC.copy, (_e, text: unknown) => {
  if (typeof text === 'string') clipboard.writeText(text)
})
ipcMain.handle(IPC.paste, () => clipboard.readText())
ipcMain.on(IPC.openExternal, (_e, url: unknown) => {
  if (typeof url === 'string' && /^(https?|mailto):/.test(url)) void electronShell.openExternal(url)
})
ipcMain.on(IPC.openConfig, () => void electronShell.openPath(settings.configFile))
ipcMain.on(IPC.openDataDir, () => void electronShell.openPath(DATA))

// The app ----------------------------------------------------------------------------------

function buildMenu(): void {
  // No Edit menu: ⌘C, ⌘V, ⌘W and the rest are the window's own commands, not the system's.
  const command = (name: string) => () => {
    const w = BrowserWindow.getFocusedWindow()
    if (w) w.webContents.send(IPC.command, name)
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(PLATFORM === 'mac'
      ? [{ label: 'shell', submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { label: 'Настройки…', click: command('config.open') }, { type: 'separator' as const }, { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const }, { type: 'separator' as const }, { role: 'quit' as const }] }]
      : []),
    { label: 'Окно', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }, { type: 'separator' }, { label: 'Инструменты разработчика', role: 'toggleDevTools' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('second-instance', () => {
  const w = mainHost?.window
  if (w && !w.isDestroyed()) {
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }
})

app.whenReady().then(() => {
  if (E2E) app.dock?.hide()
  settings = new SettingsStore(DATA, (s) => {
    quakeErrors = registerQuake()
    for (const host of hosts.values()) {
      host.ptys.setTailLimit(tailLimit(s))
      send(host, IPC.settings, settingsWithShortcuts())
    }
  })
  settings.watch()
  buildMenu()
  mainHost = createHost('main')
  quakeErrors = registerQuake()
  // Each pane's output saved now and then too, not only at the end: a crash keeps most of it.
  setInterval(() => {
    for (const host of hosts.values()) saveScrollback(host)
  }, 30_000).unref()
})

app.on('activate', () => {
  if (!mainHost) mainHost = createHost('main')
})

app.on('before-quit', () => {
  for (const host of hosts.values()) {
    saveScrollback(host)
    if (host.kind === 'main' && !host.window.isDestroyed()) host.session.save({ bounds: boundsOf(host.window) })
  }
})

app.on('window-all-closed', () => {
  // On a Mac the app stays, as Terminal.app does, and the drop-down still answers its key.
  if (PLATFORM !== 'mac') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  settings?.close()
  for (const host of hosts.values()) host.ptys.killAll()
})
