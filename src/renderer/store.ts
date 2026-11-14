/**
 * The window's state: the workspace (plain data, replaced on every change and
 * saved by the main process) and what the window shows around it.
 */
import { reactive, shallowRef } from 'vue'
import type { AgentState } from '../common/agents'
import type { FolioRequest, Settings, ShellApi, UpdateInfo } from '../common/ipc'
import type { Project } from '../common/projects'
import type { GitStatus } from '../common/git'
import type { Platform } from '../common/keys'
import type { Workspace } from '../common/layout'

declare global {
  interface Window {
    shell: ShellApi
  }
}

export const api: ShellApi = window.shell

export const ws = shallowRef<Workspace | null>(null)

export interface Dialog {
  kind: 'tab' | 'group'
  id: string
  name: string
  color: string | null
  /** A group's profile ('' for none). */
  profile?: string
  /** A new group: the dialog names it; cancelling keeps it under its first name. */
  isNew?: boolean
}

export const ui = reactive({
  platform: 'mac' as Platform,
  os: '',
  quake: false,
  home: '',
  version: '',
  settings: null as Settings | null,
  systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
  /** The palette: everything, or only the projects (the switcher). */
  palette: false as false | 'all' | 'projects',
  projects: [] as Project[],
  /** Reviews waiting in folio for an agent, by repository: what folio said. */
  reviews: {} as Record<string, string>,
  /** The new-worktree dialog, for the repository of a folder. */
  worktree: null as null | { cwd: string; root: string },
  /** Each tab's git status (its focused pane's folder), the active group's tabs only. */
  git: {} as Record<string, GitStatus | null>,
  dialog: null as Dialog | null,
  find: null as null | { query: string; count: number; index: number },
  fontDelta: 0,
  /** What each pane's program says about itself: its title (OSC 0/2) and its folder. */
  titles: {} as Record<string, string>,
  cwds: {} as Record<string, string>,
  /** Panes whose shell ended with an error, by exit code (Enter starts it again). */
  exited: {} as Record<string, number>,
  branch: null as string | null,
  /** The first chords of a chain typed so far, shown in the status bar. */
  chain: '',
  notices: [] as string[],
  update: null as UpdateInfo | null,
  /** A short message in the status bar, gone after a while. */
  message: '',
  /** The file panels over the terminal; panes whose shell runs a command now (its marks say). */
  commander: false,
  busy: {} as Record<string, boolean>,
  /** The file in the viewer: its path, absolute or relative to `cwd`. */
  viewer: null as null | { path: string; cwd?: string; line?: number },
  /** folio found on the machine: its buttons and commands are shown. */
  folio: false,
  /** The changes panel: shown or not; the baselines agents started from, by pane; files marked viewed. */
  changesOpen: false,
  baselines: {} as Record<string, import('../common/ipc').Baseline>,
  viewed: {} as Record<string, string>,
  /** The agent in each pane that runs one. */
  agents: {} as Record<string, AgentState>,
  /** A tab being dragged, to be dropped on a group. */
  draggingTab: null as string | null,
})

let messageTimer: number | undefined

export function say(text: string): void {
  ui.message = text
  window.clearTimeout(messageTimer)
  messageTimer = window.setTimeout(() => (ui.message = ''), 8000)
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

const listeners: ((next: Workspace, prev: Workspace | null) => void)[] = []

export function onCommit(f: (next: Workspace, prev: Workspace | null) => void): void {
  listeners.push(f)
}

/** The workspace changed: shown, saved, and the panes that went away closed. */
export function commit(next: Workspace): void {
  const prev = ws.value
  if (next === prev) return
  ws.value = next
  api.saveWorkspace(next)
  for (const f of listeners) f(next, prev)
}

export function shortPath(path: string): string {
  if (ui.home && (path === ui.home || path.startsWith(ui.home + '/') || path.startsWith(ui.home + '\\'))) return '~' + path.slice(ui.home.length)
  return path
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? path
}

/** folio handed a file, a project or a review; what went wrong said in the status bar. */
export function toFolio(request: FolioRequest): void {
  void api.folioOpen(JSON.parse(JSON.stringify(request)) as FolioRequest).then((r) => {
    if ('error' in r) say(`folio: ${r.error}`)
    else say('Отправлено в folio')
  })
}

/** Whether folio is on the machine, asked again (it may have been started or installed since). */
export async function findFolio(): Promise<void> {
  ui.folio = await api.folioFind()
}
