/**
 * The window's state: the workspace (plain data, replaced on every change and
 * saved by the main process) and what the window shows around it.
 */
import { reactive, shallowRef } from 'vue'
import type { Settings, ShellApi } from '../common/ipc'
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
  /** A new group: the dialog names it; cancelling keeps it under its first name. */
  isNew?: boolean
}

export const ui = reactive({
  platform: 'mac' as Platform,
  quake: false,
  home: '',
  version: '',
  settings: null as Settings | null,
  systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
  palette: false,
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
})

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
