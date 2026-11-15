/**
 * Every action of the window is a command with an id: the keys, the palette
 * and the menu run the same ones, and the user's keys name them.
 */
import { activeGroup, activeTab, addGroup, addTab, closeGroup, closePane, closeTab, cycleGroup, cycleTab, findPane, focusSide, newWorkspace, selectGroup, splitPane, tabAt, toggleZoom, updateActiveTab, updateTab, type Workspace } from '../common/layout'
import { forgetProject, saveGroupAsProject } from './projects'
import { saveSelection } from './prompts'
import { m } from './i18n'
import type { Messages } from '../common/i18n'
import { api, baseName, commit, newId, say, toFolio, ui, ws } from './store'
import * as agents from './agents'
import * as terminals from './terminals'
import { checkUpdate, restartToUpdate } from './updates'

export type GroupKey = keyof Messages['groups']

export interface Command {
  id: string
  /** Its name in the interface's language. */
  readonly title: string
  group: GroupKey
  run: () => void
  /** Not offered in the palette (the numbered ones). */
  hidden?: boolean | (() => boolean)
  /** Whether the keys run it now; when not, they go on to the program in the pane. */
  when?: () => boolean
}

function w(): Workspace {
  return ws.value!
}

export function focusedPane(): string {
  return activeTab(activeGroup(w())).focus
}

function focusedView() {
  return terminals.get(focusedPane())?.view
}

/** The focused pane closed; its tab when it was the last; the window when nothing is left. */
export function closePaneById(paneId: string): void {
  const cur = w()
  const group = cur.groups.find((g) => g.tabs.some((t) => findPane(t.root, paneId)))
  const tab = group?.tabs.find((t) => findPane(t.root, paneId))
  if (!group || !tab) return
  const next = closePane(tab, paneId)
  if (next) {
    commit({ ...cur, groups: cur.groups.map((g) => (g.id === group.id ? { ...g, tabs: g.tabs.map((t) => (t.id === tab.id ? next : t)) } : g)) })
    return
  }
  const last = cur.groups.length === 1 && group.tabs.length === 1
  if (last) {
    commit(newWorkspace(newId, ui.home))
    window.close()
    return
  }
  commit(closeTab(cur, tab.id, newId))
}

function newGroupHere(): void {
  const cwd = terminals.paneCwd(focusedPane()) ?? ui.home
  const next = addGroup(w(), newId, { name: baseName(cwd) || m().names.group, cwd })
  commit(next)
  const g = activeGroup(next)
  ui.dialog = { kind: 'group', id: g.id, name: g.name, color: g.color, isNew: true }
}

/** The focused pane's repository (or its folder, for a project) handed to folio. */
async function folioRepo(kind: 'review' | 'project'): Promise<void> {
  const cwd = terminals.paneCwd(focusedPane())
  if (!cwd) return say(m().common.paneFolderUnknown)
  const repo = (await api.changesBaseline(cwd, 'head'))?.root
  if (kind === 'review' && !repo) return say(m().common.notRepo)
  toFolio(kind === 'review' ? { review: repo } : { project: repo ?? cwd })
}

function toggleBroadcast(scope: 'tab' | 'group'): void {
  ui.broadcast = ui.broadcast === scope ? null : scope
  say(ui.broadcast ? m().say.broadcastOn(scope) : m().say.broadcastOff)
}

function fontBy(delta: number | null): void {
  ui.fontDelta = delta === null ? 0 : Math.max(-6, Math.min(24, ui.fontDelta + delta))
  terminals.restyle()
}

const list: Omit<Command, 'title'>[] = [
  { id: 'palette.open', group: 'window', run: () => (ui.palette = ui.palette ? false : 'all') },
  {
    id: 'git.worktree', group: 'projects',
    run: () => {
      const cwd = terminals.paneCwd(focusedPane())
      if (!cwd) return say(m().common.paneFolderUnknown)
      void api.changesBaseline(cwd, 'head').then((b) => (b ? (ui.worktree = { cwd, root: b.root }) : say(m().common.notRepo)))
    },
  },
  { id: 'input.broadcastTab', group: 'terminal', run: () => toggleBroadcast('tab') },
  { id: 'input.broadcastGroup', group: 'terminal', run: () => toggleBroadcast('group') },
  { id: 'prompts.insert', group: 'agents', run: () => (ui.palette = ui.palette === 'prompts' ? false : 'prompts') },
  { id: 'prompts.saveSelection', group: 'agents', run: () => void saveSelection() },
  { id: 'prompts.folder', group: 'agents', run: () => api.openPrompts() },
  { id: 'project.switch', group: 'projects', run: () => (ui.palette = ui.palette === 'projects' ? false : 'projects') },
  { id: 'project.save', group: 'projects', run: () => void saveGroupAsProject() },
  { id: 'project.forget', group: 'projects', hidden: () => !ui.projects.some((p) => p.id === activeGroup(w()).project), run: forgetProject },
  { id: 'sidebar.toggle', group: 'window', run: () => commit({ ...w(), sidebarCollapsed: !w().sidebarCollapsed }) },
  { id: 'settings.open', group: 'window', run: () => (ui.settingsOpen = !ui.settingsOpen) },
  { id: 'config.open', group: 'window', run: () => api.openConfig() },
  {
    id: 'security.secureKeyboard', group: 'window', hidden: () => ui.os !== 'darwin',
    run: () => {
      const on = !ui.settings?.config.security.secureKeyboard
      void api.setSetting('security', 'secure-keyboard', on).then((r) => say('error' in r ? r.error : on ? m().say.secureOn : m().say.secureOff))
    },
  },
  { id: 'data.open', group: 'window', run: () => api.openDataDir() },
  {
    id: 'commander.toggle', group: 'files',
    // A full-screen program (vim, less, mc itself) keeps the keys.
    when: () => ui.commander || terminals.get(focusedPane())?.term.buffer !== terminals.get(focusedPane())?.term.alt,
    run: () => (ui.commander = !ui.commander),
  },
  { id: 'tree.toggle', group: 'window', run: () => (ui.treeOpen = !ui.treeOpen) },
  { id: 'changes.toggle', group: 'agents', run: () => (ui.changesOpen = !ui.changesOpen) },
  { id: 'claude.hooksOn', group: 'agents', run: () => void api.claudeHooks(true).then(say) },
  { id: 'claude.hooksOff', group: 'agents', run: () => void api.claudeHooks(false).then(say) },
  { id: 'folio.review', group: 'folio', hidden: () => !ui.folio, run: () => void folioRepo('review') },
  { id: 'folio.project', group: 'folio', hidden: () => !ui.folio, run: () => void folioRepo('project') },
  { id: 'update.check', group: 'window', run: () => checkUpdate() },
  { id: 'update.restart', group: 'window', run: () => restartToUpdate() },
  { id: 'font.bigger', group: 'window', run: () => fontBy(1) },
  { id: 'font.smaller', group: 'window', run: () => fontBy(-1) },
  { id: 'font.reset', group: 'window', run: () => fontBy(null) },

  { id: 'group.new', group: 'groups', run: newGroupHere },
  {
    id: 'group.rename', group: 'groups',
    run: () => {
      const g = activeGroup(w())
      ui.dialog = { kind: 'group', id: g.id, name: g.name, color: g.color, profile: g.profile ?? '' }
    },
  },
  { id: 'group.close', group: 'groups', run: () => commit(closeGroup(w(), activeGroup(w()).id, newId)) },
  { id: 'group.next', group: 'groups', run: () => commit(cycleGroup(w(), 1)) },
  { id: 'group.prev', group: 'groups', run: () => commit(cycleGroup(w(), -1)) },

  { id: 'tab.new', group: 'tabs', run: () => commit(addTab(w(), newId, { cwd: terminals.paneCwd(focusedPane()) })) },
  { id: 'tab.close', group: 'tabs', run: () => commit(closeTab(w(), activeTab(activeGroup(w())).id, newId)) },
  { id: 'tab.next', group: 'tabs', run: () => commit(cycleTab(w(), 1)) },
  { id: 'tab.prev', group: 'tabs', run: () => commit(cycleTab(w(), -1)) },
  {
    id: 'tab.rename', group: 'tabs',
    run: () => {
      const t = activeTab(activeGroup(w()))
      ui.dialog = { kind: 'tab', id: t.id, name: t.name ?? '', color: t.color ?? null }
    },
  },

  { id: 'pane.splitRight', group: 'panes', run: () => commit(updateActiveTab(w(), (t) => splitPane(t, t.focus, 'row', newId))) },
  { id: 'pane.splitDown', group: 'panes', run: () => commit(updateActiveTab(w(), (t) => splitPane(t, t.focus, 'column', newId))) },
  { id: 'pane.close', group: 'panes', run: () => closePaneById(focusedPane()) },
  { id: 'pane.zoom', group: 'panes', run: () => commit(updateActiveTab(w(), toggleZoom)) },
  { id: 'pane.focusLeft', group: 'panes', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'left'))) },
  { id: 'pane.focusRight', group: 'panes', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'right'))) },
  { id: 'pane.focusUp', group: 'panes', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'up'))) },
  { id: 'pane.focusDown', group: 'panes', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'down'))) },

  { id: 'terminal.clear', group: 'terminal', run: () => focusedView()?.clear() },
  { id: 'terminal.find', group: 'terminal', run: () => (ui.find = { query: ui.find?.query ?? '', count: 0, index: 0 }) },
  {
    id: 'terminal.copy', group: 'terminal',
    run: () => {
      const text = focusedView()?.getSelection()
      if (text) api.copy(text)
    },
  },
  {
    id: 'terminal.paste', group: 'terminal',
    run: () => {
      const id = focusedPane()
      void api.paste().then((text) => {
        const e = terminals.get(id)
        if (!e || !text) return
        e.view.clearSelection()
        e.view.scrollToBottom()
        terminals.typing(e)
        e.term.paste(text)
      })
    },
  },
  { id: 'terminal.selectAll', group: 'terminal', run: () => focusedView()?.selectAll() },
  { id: 'terminal.prevCommand', group: 'terminal', run: () => void focusedView()?.scrollToCommand(-1) },
  { id: 'terminal.nextCommand', group: 'terminal', run: () => void focusedView()?.scrollToCommand(1) },
]

for (let i = 1; i <= 9; i++) {
  list.push({ id: `tab.select.${i}`, group: 'tabs', hidden: true, run: () => commit(tabAt(w(), i)) })
  list.push({
    id: `group.select.${i}`, group: 'groups', hidden: true,
    run: () => {
      const g = w().groups[i - 1]
      if (g) commit(selectGroup(w(), g.id))
    },
  })
}

/** A command's name in the interface's language (the numbered ones by their number). */
function titleOf(id: string): string {
  const t = m().commands
  const n = /^(tab|group)\.select\.(\d)$/.exec(id)
  if (n) return n[1] === 'tab' ? t.tabAt(Number(n[2])) : t.groupAt(Number(n[2]))
  return (t as unknown as Record<string, string>)[id] ?? id
}

export const COMMANDS = new Map<string, Command>(list.map((c) => [c.id, Object.defineProperty({ ...c }, 'title', { get: () => titleOf(c.id), enumerable: true }) as Command]))

/** A new tab with a name, in a folder (the focused pane's by default); its pane's id. */
export function newNamedTab(name: string, cwd?: string): string {
  const next = addTab(w(), newId, { cwd: cwd ?? terminals.paneCwd(focusedPane()) })
  const tab = activeTab(activeGroup(next))
  commit(updateTab(next, tab.id, { name }))
  return tab.focus
}

/** A new tab named after an agent, the agent's command typed once its shell is ready. */
export function newAgentTab(agent: string): void {
  agents.typeWhenReady(newNamedTab(agent), agent)
}

/** A new tab in the active group, started with a profile. */
export function newTabWithProfile(profile: string): void {
  // The profile's own folder wins over the group's; none: the group's, as for any new tab.
  const own = ui.settings?.config.profiles[profile]?.cwd
  const cwd = own ? own.replace(/^~(?=$|[\\/])/, ui.home) : undefined
  commit(addTab(w(), newId, { profile, ...(cwd ? { cwd } : {}) }))
}

export function run(id: string): boolean {
  const c = COMMANDS.get(id)
  if (!c || !ws.value) return false
  c.run()
  return true
}
