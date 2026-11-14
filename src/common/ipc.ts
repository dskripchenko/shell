/**
 * What the window and the main process say to each other: one typed surface,
 * `window.shell`, put there by the preload. The window gets no Node and no
 * Electron; everything it may do is here.
 */
import type { ConfigResult } from './config'
import type { Platform } from './keys'
import type { Workspace } from './layout'
import type { Project } from './projects'
import type { GitStatus } from './git'
import type { ApiRequest } from '../main/api'
import type { Theme } from './themes'
import type { ShellEvent } from '@dskripchenko/shell-integration'
import type { Baseline, ChangedFile } from '../main/changes'
import type { OpResult } from '../main/files'
import type { Entry } from './commander'
import type { SshHost } from './ssh'
export type { OpResult }
export type { Baseline, ChangedFile }

export interface Startup {
  platform: Platform
  /** The system itself (Windows matters for paths and quoting). */
  os: string
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
  /** Each folder's git status (null: not a repository), asked together. */
  gitStatus(cwds: string[]): Promise<Record<string, GitStatus | null>>
  /** A worktree of the folder's repository on a branch (made when new), beside the repository. */
  addWorktree(cwd: string, branch: string): Promise<{ path: string } | { error: string }>
  /** The projects (shared by the windows); saved whole, each window told. */
  projects(): Promise<Project[]>
  saveProjects(projects: Project[]): void
  onProjects(listener: (projects: Project[]) => void): void
  /** Another program's request (folio over the local API), answered with a status and a body. */
  /** Paths with their links resolved (a path that is not there: as given). */
  realpaths(paths: string[]): Promise<string[]>
  onApiRequest(listener: (request: ApiRequest) => Promise<ApiReply> | ApiReply): void
  onData(listener: (paneId: string, data: string) => void): void
  onExit(listener: (paneId: string, code: number) => void): void
  onEvents(listener: (paneId: string, events: ShellEvent[]) => void): void
  /** An agent said what it is doing (shell-notify). */
  onAgentSignal(listener: (signal: AgentSignal) => void): void
  /** A baseline to count an agent's changes from: the working tree now ('agent'), or HEAD ('head'). */
  changesBaseline(cwd: string, kind: 'agent' | 'head'): Promise<Baseline | null>
  changesList(baseline: Baseline): Promise<ChangedFile[] | { error: string }>
  changesDiff(baseline: Baseline, path: string, untracked: boolean): Promise<{ diff: string } | { text: string } | { error: string }>
  /** Whether folio is on the machine (the config's path, a running folio, the usual places). */
  folioFind(): Promise<boolean>
  /** folio handed a file at a line, a folder as a project, a repository's review. */
  folioOpen(request: FolioRequest): Promise<{ ok: true } | { error: string }>
  /** A file opened for the viewer (a path absolute, or relative to `cwd`). */
  viewerOpen(path: string, cwd?: string): Promise<ViewerDoc | { error: string }>
  /** A file opened by the system's own program. */
  openPath(path: string): void
  /** SSH hosts (~/.ssh/config) and their files over sftp. */
  remote: {
    hosts(): Promise<SshHost[]>
    home(alias: string): Promise<{ path: string } | { error: string }>
    list(alias: string, path: string): Promise<Entry[] | { error: string }>
    get(alias: string, items: string[], localDir: string): Promise<OpResult>
    put(alias: string, items: string[], remoteDir: string): Promise<OpResult>
    mkdir(alias: string, path: string): Promise<string | null>
    rename(alias: string, from: string, to: string): Promise<string | null>
    remove(alias: string, items: { path: string; dir: boolean }[]): Promise<OpResult>
    fetch(alias: string, path: string): Promise<{ local: string } | { error: string }>
  }
  /** The file panels' work on disk. */
  files: {
    list(dir: string): Promise<Entry[] | { error: string }>
    copy(items: string[], target: string): Promise<OpResult>
    move(items: string[], target: string): Promise<OpResult>
    rename(item: string, to: string): Promise<string | null>
    mkdir(path: string): Promise<string | null>
    trash(items: string[]): Promise<OpResult>
    head(path: string): Promise<{ text: string; truncated: boolean } | { binary: true; size: number } | { error: string }>
  }
  /** Claude Code's hooks for shell put in or taken out of ~/.claude/settings.json; what happened, in words. */
  claudeHooks(on: boolean): Promise<string>
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

export interface ViewerDoc {
  path: string
  name: string
  base: string
  url: string
  text: string | null
  size: number
}

export interface AgentSignal {
  paneId: string
  state: 'running' | 'waiting' | 'done'
  agent?: string
  message?: string
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
  agentSignal: 'agent:signal',
  claudeHooks: 'claude:hooks',
  changesBaseline: 'changes:baseline',
  changesList: 'changes:list',
  changesDiff: 'changes:diff',
  viewerOpen: 'viewer:open',
  folioFind: 'folio:find',
  folioOpen: 'folio:open',
  openPath: 'open:path',
  remoteHosts: 'remote:hosts',
  remoteHome: 'remote:home',
  remoteList: 'remote:list',
  remoteGet: 'remote:get',
  remotePut: 'remote:put',
  remoteMkdir: 'remote:mkdir',
  remoteRename: 'remote:rename',
  remoteRemove: 'remote:remove',
  remoteFetch: 'remote:fetch',
  filesList: 'files:list',
  filesCopy: 'files:copy',
  filesMove: 'files:move',
  filesRename: 'files:rename',
  filesMkdir: 'files:mkdir',
  filesTrash: 'files:trash',
  filesHead: 'files:head',
  saveWorkspace: 'session:save',
  gitStatus: 'git:status',
  addWorktree: 'git:worktree',
  projects: 'projects:list',
  saveProjects: 'projects:save',
  projectsChanged: 'projects:changed',
  apiRequest: 'api:request',
  realpaths: 'fs:realpaths',
  apiReply: 'api:reply',
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

/** What folio is asked to open (paths absolute). */
export interface FolioRequest {
  file?: { path: string; line?: number }
  project?: string
  review?: string
}

export type { ApiRequest }
export interface ApiReply {
  status: number
  body?: Record<string, unknown>
}
