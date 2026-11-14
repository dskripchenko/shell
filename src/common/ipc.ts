/**
 * What the window and the main process say to each other: one typed surface,
 * `window.shell`, put there by the preload. The window gets no Node and no
 * Electron; everything it may do is here.
 */
import type { ConfigResult } from './config'
import type { Platform } from './keys'
import type { Workspace } from './layout'
import type { Theme } from './themes'
import type { ShellEvent } from '@dskripchenko/shell-integration'

export interface Startup {
  platform: Platform
  /** This window is the drop-down one (its own workspace). */
  quake: boolean
  home: string
  workspace: Workspace | null
  /** The last output of each pane, kept from the run before, to show again. */
  replay: Record<string, string>
  settings: Settings
  version: string
  /** Under test: the window lets the tests read each pane's whole buffer. */
  e2e: boolean
}

export interface Settings extends ConfigResult {
  /** Themes imported from the themes folder, after the built-in ones. */
  themes: Theme[]
  themeErrors: string[]
  dataDir: string
}

export type SpawnResult = { ok: true; pid: number } | { ok: false; error: string }

export interface ShellApi {
  startup(): Promise<Startup>
  spawn(paneId: string, opts: { cwd?: string; cols: number; rows: number; profile?: string }): Promise<SpawnResult>
  write(paneId: string, data: string): void
  resize(paneId: string, cols: number, rows: number): void
  kill(paneId: string): void
  /** The folder the pane's shell is in, asked of the system; null where it cannot tell. */
  cwd(paneId: string): Promise<string | null>
  gitBranch(folder: string): Promise<string | null>
  saveWorkspace(ws: Workspace): void
  onData(listener: (paneId: string, data: string) => void): void
  onExit(listener: (paneId: string, code: number) => void): void
  onEvents(listener: (paneId: string, events: ShellEvent[]) => void): void
  onSettings(listener: (settings: Settings) => void): void
  /** A window-level command sent by the main process (the menu, the drop-down hotkey). */
  onCommand(listener: (command: string) => void): void
  copy(text: string): void
  paste(): Promise<string>
  openExternal(url: string): void
  openConfig(): void
  openDataDir(): void
  updateState(): Promise<UpdateInfo>
  checkUpdate(): void
  /** The update put in place now: shell closes and starts again. */
  restartToUpdate(): void
  onUpdate(listener: (info: UpdateInfo) => void): void
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'downloading'; version: string; received?: number; total?: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; error: string }

export interface UpdateInfo {
  state: UpdateState
  current: string
  /** Updates are possible here: a packaged build, auto or by hand. */
  available: boolean
  auto: boolean
}

/** The channels behind it. */
export const IPC = {
  startup: 'shell:startup',
  spawn: 'pty:spawn',
  write: 'pty:write',
  resize: 'pty:resize',
  kill: 'pty:kill',
  cwd: 'pty:cwd',
  gitBranch: 'git:branch',
  data: 'pty:data',
  exit: 'pty:exit',
  events: 'pty:events',
  saveWorkspace: 'session:save',
  settings: 'settings:changed',
  command: 'window:command',
  copy: 'clipboard:copy',
  paste: 'clipboard:paste',
  openExternal: 'open:external',
  openConfig: 'open:config',
  openDataDir: 'open:data',
  updateState: 'update:state',
  updateCheck: 'update:check',
  updateRestart: 'update:restart',
  updateChanged: 'update:changed',
} as const
