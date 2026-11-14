/**
 * The main process: the window (and the drop-down one), the shells, the
 * settings and the last session — everything the window may not touch itself.
 */
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeTheme, net, protocol, screen, shell as electronShell, type WebContents } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { toAccelerator, type Platform } from '../common/keys'
import { allPanes, type Workspace } from '../common/layout'
import { IPC, type Settings, type Startup } from '../common/ipc'
import { dataDir } from './dataDir'
import { gitBranch, processCwd } from './probe'
import { Ptys } from './pty'
import { SessionStore, writeAtomic, type Bounds } from './session'
import { SettingsStore } from './settings'
import { Updater, type UpdateState } from './update'
import { readFileSync, realpathSync } from 'node:fs'
import { NotifyServer } from './notify'
import { apiToken, presencePath, removePresence, writePresence } from './api'
import { copyInto, listDir, makeDir, moveInto, moveTo, readHead, type OpResult } from './files'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { findFolio, folioRequest, launchFolio, presenceOf, projectsOf } from './folio'
import { addWorktree, gitStatus } from './git'
import { lookOf } from '../common/themes'
import { ProjectsStore } from './projects'
import { SCHEME, ViewerFiles } from './viewer'
import { remoteFetch, remoteGet, remoteHome, remoteList, remoteMkdir, remotePut, remoteRemove, remoteRename, sshHosts } from './remote'
import { setClaudeHooks } from './claudeHooks'
import { changedFiles, fileDiff, headBaseline, repoEdits, repoRoot, takeBaseline, type Baseline } from './changes'
import type { UpdateInfo } from '../common/ipc'

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

// The viewer's scheme: a page and documents on an origin of their own (src/main/viewer.ts).
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
const viewerFiles = new ViewerFiles(join(__dirname, 'renderer'))

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
    icon: join(__dirname, 'icon.png'),
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
        events: (paneId, events) => send(host, IPC.events, paneId, events),
      },
      VERSION,
      tailLimit(s),
      join(DATA, 'shell-integration'),
      (paneId, path) => notify.env(paneId, path, process.platform),
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
  return { platform: PLATFORM, os: process.platform, quake: host.kind === 'quake', home: homedir(), workspace: host.workspace, replay: host.replay, settings: settingsWithShortcuts(), version: VERSION, e2e: E2E }
})

ipcMain.handle(IPC.spawn, (e, paneId: unknown, opts: unknown) => {
  const host = hostOf(e.sender)
  if (!host || typeof paneId !== 'string' || !opts || typeof opts !== 'object') return { ok: false, error: 'bad request' }
  const o = opts as { cwd?: unknown; cols?: unknown; rows?: unknown; profile?: unknown }
  const config = settings.get().config
  // A profile's program with its own arguments; else the [shell] one, with the profile's arguments if it gives them.
  const p = typeof o.profile === 'string' ? config.profiles[o.profile] : undefined
  const program = p?.program ?? config.shell.program
  const args = p?.args ?? (p?.program ? [] : config.shell.args)
  const home = (path: string) => path.replace(/^~(?=$|[\\/])/, homedir())
  return host.ptys.spawn(paneId, {
    cwd: typeof o.cwd === 'string' ? o.cwd : p?.cwd ? home(p.cwd) : undefined,
    cols: typeof o.cols === 'number' ? o.cols : 80,
    rows: typeof o.rows === 'number' ? o.rows : 24,
    shell: { program, args, env: p?.env },
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
ipcMain.handle(IPC.gitStatus, async (_e, cwds: unknown) => {
  const list = Array.isArray(cwds) ? [...new Set(cwds.filter((c): c is string => typeof c === 'string' && isAbsolute(c)))].slice(0, 64) : []
  return Object.fromEntries(await Promise.all(list.map(async (c) => [c, await gitStatus(c)] as const)))
})
ipcMain.handle(IPC.addWorktree, (_e, cwd: unknown, branch: unknown) =>
  typeof cwd === 'string' && isAbsolute(cwd) && typeof branch === 'string' && branch.trim() ? addWorktree(cwd, branch.trim()) : { error: 'нет ветки' },
)

const projects = new ProjectsStore(DATA)
ipcMain.handle(IPC.projects, () => projects.all())
ipcMain.on(IPC.saveProjects, (_e, list: unknown) => {
  const saved = projects.save(list)
  for (const host of hosts.values()) send(host, IPC.projectsChanged, saved)
})

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
ipcMain.handle(IPC.setSetting, (_e, section: unknown, key: unknown, value: unknown) =>
  typeof section === 'string' && typeof key === 'string' ? settings.set(section, key, value) : { error: 'нет настройки' },
)

/** macOS: Secure Keyboard Entry as the config says; elsewhere there is no such thing. */
function applySecureKeyboard(active = !!BrowserWindow.getFocusedWindow()): void {
  // Only while shell is in front, as Terminal.app does: secure input held in the background would take the keys from other programs' reach too.
  if (process.platform === 'darwin') app.setSecureKeyboardEntryEnabled(active && settings.get().config.security.secureKeyboard)
}
app.on('did-become-active', () => {
  if (settings) applySecureKeyboard(true)
})
app.on('did-resign-active', () => {
  if (settings) applySecureKeyboard(false)
})
ipcMain.on(IPC.openDataDir, () => void electronShell.openPath(DATA))

// Agents' signals (shell-notify) ---------------------------------------------------------------

const notify = new NotifyServer(join(DATA, 'bin'), (s) => {
  for (const host of hosts.values()) {
    if (!host.ptys.has(s.paneId)) continue
    send(host, IPC.agentSignal, s)
    return true
  }
  return false
})

// Other programs (folio) over the local API: asked of the main window, answered by it.
const apiFile = presencePath(process.env)
const pendingApi = new Map<number, (reply: { status: number; body?: object }) => void>()
let apiSeq = 0
notify.api = {
  token: apiToken(),
  handle: (request) =>
    new Promise((resolve) => {
      // Answered here, from the settings and the projects: no window needed.
      if (request.kind === 'look') {
        const c = settings.get()
        return resolve({ status: 200, body: { ...lookOf(c.config.theme, c.themes), font: { family: c.config.font.family, size: c.config.font.size } } })
      }
      if (request.kind === 'projects') return resolve({ status: 200, body: { projects: projects.all().map((p) => ({ name: p.name, root: p.root, color: p.color })) } })
      const host = mainHost
      if (!host || host.window.isDestroyed()) return resolve({ status: 503 })
      if (request.kind === 'open-tab' || request.kind === 'paste') {
        if (host.window.isMinimized()) host.window.restore()
        if (E2E) host.window.showInactive()
        else {
          host.window.show()
          host.window.focus()
        }
      }
      const id = ++apiSeq
      const timer = setTimeout(() => {
        pendingApi.delete(id)
        resolve({ status: 504 })
      }, 5000)
      pendingApi.set(id, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
      send(host, IPC.apiRequest, id, request)
    }),
}
ipcMain.handle(IPC.realpaths, (_e, paths: unknown) =>
  Array.isArray(paths)
    ? paths.slice(0, 512).map((p) => {
        if (typeof p !== 'string') return ''
        try {
          return realpathSync.native(p)
        } catch {
          return p
        }
      })
    : [],
)
ipcMain.on(IPC.apiReply, (_e, id: unknown, reply: unknown) => {
  const done = typeof id === 'number' ? pendingApi.get(id) : undefined
  if (!done) return
  pendingApi.delete(id as number)
  const r = reply as { status?: unknown; body?: unknown }
  done({ status: typeof r?.status === 'number' ? r.status : 500, ...(r?.body && typeof r.body === 'object' ? { body: r.body } : {}) })
})

// An agent's changes: the baseline the window holds is checked to be a repository's root before use.
async function checkedBaseline(b: unknown): Promise<Baseline | null> {
  if (!b || typeof b !== 'object') return null
  const o = b as Partial<Baseline>
  if (typeof o.root !== 'string' || (o.base !== null && typeof o.base !== 'string') || !Array.isArray(o.untracked)) return null
  if (o.base && !/^[0-9a-f]{7,64}$/.test(o.base)) return null
  return (await repoRoot(o.root)) === o.root ? { root: o.root, base: o.base ?? null, untracked: o.untracked.filter((x): x is string => typeof x === 'string') } : null
}
ipcMain.handle(IPC.changesBaseline, (_e, cwd: unknown, kind: unknown) => (typeof cwd === 'string' && cwd ? (kind === 'head' ? headBaseline(cwd) : takeBaseline(cwd)) : null))
ipcMain.handle(IPC.changesList, async (_e, b: unknown) => {
  const base = await checkedBaseline(b)
  if (!base) return { error: 'не репозиторий git' }
  try {
    return await changedFiles(base)
  } catch (e) {
    return { error: e instanceof Error && /ENOENT/.test(e.message) ? 'нужна программа git' : String(e instanceof Error ? e.message : e).split('\n')[0] }
  }
})
ipcMain.handle(IPC.changesEdits, async (_e, b: unknown) => {
  const base = await checkedBaseline(b)
  return base ? repoEdits(base.root) : []
})
ipcMain.handle(IPC.changesDiff, async (_e, b: unknown, path: unknown, untracked: unknown) => {
  const base = await checkedBaseline(b)
  if (!base || typeof path !== 'string') return { error: 'не репозиторий git' }
  try {
    return await fileDiff(base, path, untracked === true)
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e).split('\n')[0] }
  }
})

// The file panels: absolute paths only; errors said in words.
const paths = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string' && isAbsolute(x)) ? (v as string[]) : null)
const said = (e: unknown) => (e instanceof Error ? e.message.replace(/^\w+: /, '') : String(e))
ipcMain.handle(IPC.filesList, async (_e, dir: unknown) => {
  if (typeof dir !== 'string' || !isAbsolute(dir)) return { error: 'не путь' }
  try {
    return await listDir(dir)
  } catch (e) {
    return { error: said(e) }
  }
})
ipcMain.handle(IPC.filesCopy, (_e, items: unknown, target: unknown) => {
  const list = paths(items)
  return list && typeof target === 'string' && isAbsolute(target) ? copyInto(list, target) : { done: [], failed: [] }
})
ipcMain.handle(IPC.filesMove, (_e, items: unknown, target: unknown) => {
  const list = paths(items)
  return list && typeof target === 'string' && isAbsolute(target) ? moveInto(list, target) : { done: [], failed: [] }
})
ipcMain.handle(IPC.filesRename, async (_e, item: unknown, to: unknown) => {
  if (typeof item !== 'string' || typeof to !== 'string' || !isAbsolute(item) || !isAbsolute(to)) return 'не путь'
  try {
    await moveTo(item, to)
    return null
  } catch (e) {
    return said(e)
  }
})
ipcMain.handle(IPC.filesMkdir, async (_e, path: unknown) => {
  if (typeof path !== 'string' || !isAbsolute(path)) return 'не путь'
  try {
    await makeDir(path)
    return null
  } catch (e) {
    return said(e)
  }
})
ipcMain.handle(IPC.filesTrash, async (_e, items: unknown): Promise<OpResult> => {
  const r: OpResult = { done: [], failed: [] }
  for (const item of paths(items) ?? []) {
    try {
      await electronShell.trashItem(item)
      r.done.push(item)
    } catch (e) {
      r.failed.push({ path: item, error: said(e) })
    }
  }
  return r
})
ipcMain.handle(IPC.filesHead, async (_e, path: unknown) => {
  if (typeof path !== 'string' || !isAbsolute(path)) return { error: 'не путь' }
  try {
    return await readHead(path)
  } catch (e) {
    return { error: said(e) }
  }
})

// SSH hosts and sftp: a host's name and remote paths as given (sftp quotes them); local paths absolute.
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(str)
ipcMain.handle(IPC.remoteHosts, () => sshHosts())
ipcMain.handle(IPC.remoteHome, (_e, a: unknown) => (str(a) ? remoteHome(a) : { error: 'нет хоста' }))
ipcMain.handle(IPC.remoteList, (_e, a: unknown, p: unknown) => (str(a) && str(p) ? remoteList(a, p) : { error: 'нет пути' }))
ipcMain.handle(IPC.remoteGet, (_e, a: unknown, items: unknown, dir: unknown) => (str(a) && strs(items) && str(dir) && isAbsolute(dir) ? remoteGet(a, items, dir) : { done: [], failed: [] }))
ipcMain.handle(IPC.remotePut, (_e, a: unknown, items: unknown, dir: unknown) => (str(a) && strs(items) && items.every((i) => isAbsolute(i)) && str(dir) ? remotePut(a, items, dir) : { done: [], failed: [] }))
ipcMain.handle(IPC.remoteMkdir, (_e, a: unknown, p: unknown) => (str(a) && str(p) ? remoteMkdir(a, p) : 'нет пути'))
ipcMain.handle(IPC.remoteRename, (_e, a: unknown, f: unknown, t: unknown) => (str(a) && str(f) && str(t) ? remoteRename(a, f, t) : 'нет пути'))
ipcMain.handle(IPC.remoteRemove, (_e, a: unknown, items: unknown) =>
  str(a) && Array.isArray(items) && items.every((i) => i && typeof i === 'object' && str((i as { path?: unknown }).path)) ? remoteRemove(a, items as { path: string; dir: boolean }[]) : { done: [], failed: [] },
)
ipcMain.handle(IPC.remoteFetch, (_e, a: unknown, p: unknown) => (str(a) && str(p) ? remoteFetch(a, p) : { error: 'нет пути' }))

// A file for the viewer: a path, absolute or relative to the pane's folder (`~` the home).
ipcMain.handle(IPC.viewerOpen, async (_e, path: unknown, cwd: unknown) => {
  if (typeof path !== 'string' || !path) return { error: 'нет пути' }
  const expanded = path.replace(/^~(?=$|[\\/])/, homedir())
  const full = isAbsolute(expanded) ? expanded : typeof cwd === 'string' && isAbsolute(cwd) ? resolvePath(cwd, expanded) : null
  if (!full) return { error: 'путь не найден' }
  const root = await repoRoot(dirname(full)).catch(() => null)
  const r = await viewerFiles.open(full, root)
  return 'error' in r ? r : { ...r, path: full }
})
ipcMain.on(IPC.openPath, (_e, path: unknown) => {
  if (typeof path === 'string' && isAbsolute(path)) void electronShell.openPath(path)
})

/** folio, looked for anew on each ask: it may have started or been installed since. */
const folioOf = () => {
  const c = settings.get().config.folio
  if (!c.enabled) return null
  return findFolio({ configured: c.path, env: process.env, platform: process.platform, execPath: process.execPath, uid: process.getuid?.() })
}
ipcMain.handle(IPC.folioFind, () => folioOf() !== null)
// folio's projects: a running folio's, kept for when it is closed.
const folioProjectsFile = join(DATA, 'folio-projects.json')
ipcMain.handle(IPC.folioProjects, () => {
  if (!settings.get().config.folio.enabled) return []
  const running = presenceOf({ configured: '', env: process.env, platform: process.platform, execPath: process.execPath, uid: process.getuid?.() })
  if (running?.projects) {
    try {
      writeAtomic(folioProjectsFile, JSON.stringify(running.projects))
    } catch {
      // Not kept: shown while folio runs.
    }
    return running.projects
  }
  try {
    return projectsOf(JSON.parse(readFileSync(folioProjectsFile, 'utf8')))
  } catch {
    return []
  }
})
ipcMain.handle(IPC.folioOpen, (_e, r: unknown) => {
  const request = folioRequest(r)
  if (!request) return { error: 'не путь' }
  const folio = folioOf()
  return folio ? launchFolio(folio, request, process.env) : { error: 'folio не найден' }
})

ipcMain.handle(IPC.claudeHooks, (_e, on: unknown) => setClaudeHooks(join(homedir(), '.claude', 'settings.json'), on === true))

// Updates ----------------------------------------------------------------------------------

// Checked and applied only in a packaged build (SHELL_UPDATE_URL points a development build at a test feed).
const UPDATABLE = app.isPackaged || !!process.env.SHELL_UPDATE_URL
const updater = new Updater({
  product: { name: 'shell', repo: 'dskripchenko/shell', dataFolder: 'shell-data' },
  dir: join(DATA, 'update'),
  current: VERSION,
  platform: process.platform,
  arch: process.arch,
  execPath: process.execPath,
  appImage: process.env.APPIMAGE,
  fetch: (url, init) => net.fetch(url, init),
  releases: process.env.SHELL_UPDATE_URL,
  onState: () => {
    for (const host of hosts.values()) send(host, IPC.updateChanged, updateInfo())
  },
})

function updateInfo(state: UpdateState = updater.current): UpdateInfo {
  return { state, current: VERSION, available: UPDATABLE, auto: settings?.get().config.updates.auto ?? true }
}

ipcMain.handle(IPC.updateState, () => updateInfo())
ipcMain.on(IPC.updateCheck, () => {
  if (UPDATABLE) void updater.check()
})
ipcMain.on(IPC.updateRestart, () => {
  if (updater.current.status !== 'ready') return
  updater.restartAfter()
  app.quit()
})

app.on('quit', () => {
  const r = updater.apply(process.pid)
  if (r.relaunch) app.relaunch(r.execPath ? { execPath: r.execPath } : undefined)
})

// The app ----------------------------------------------------------------------------------

function buildMenu(): void {
  // No Edit menu: ⌘C, ⌘V, ⌘W and the rest are the window's own commands, not the system's.
  const command = (name: string) => () => {
    const w = BrowserWindow.getFocusedWindow()
    if (w) w.webContents.send(IPC.command, name)
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(PLATFORM === 'mac'
      ? [{ label: 'shell', submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { label: 'Настройки…', click: command('settings.open') }, { type: 'separator' as const }, { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const }, { type: 'separator' as const }, { role: 'quit' as const }] }]
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

app.whenReady().then(async () => {
  if (E2E) app.dock?.hide()
  protocol.handle(SCHEME, (req) => viewerFiles.handle(req.url))
  try {
    await notify.start()
    // Found by folio while shell runs (under test only where a test says).
    if (notify.url && notify.api && (!E2E || process.env.SHELL_PRESENCE)) writePresence(apiFile, { pid: process.pid, version: VERSION, url: notify.url, token: notify.api.token })
  } catch {
    // No local port: agents' signals do not reach shell; the rest works.
  }
  settings = new SettingsStore(DATA, (s) => {
    applySecureKeyboard()
    quakeErrors = registerQuake()
    for (const host of hosts.values()) {
      host.ptys.setTailLimit(tailLimit(s))
      send(host, IPC.settings, settingsWithShortcuts())
    }
  })
  settings.watch()
  applySecureKeyboard()
  buildMenu()
  mainHost = createHost('main')
  quakeErrors = registerQuake()
  updater.tidy()
  if (UPDATABLE && settings.get().config.updates.auto && updater.due()) void updater.check()
  // Under test the drop-down window is shown by a call: no global key can be pressed from a test.
  if (E2E) (globalThis as { shellToggleQuake?: () => void }).shellToggleQuake = toggleQuake
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
  removePresence(apiFile, process.pid, (p) => readFileSync(p, 'utf8'))
  notify.close()
  globalShortcut.unregisterAll()
  settings?.close()
  for (const host of hosts.values()) host.ptys.killAll()
})
