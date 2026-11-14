/**
 * Every action of the window is a command with an id: the keys, the palette
 * and the menu run the same ones, and the user's keys name them.
 */
import { activeGroup, activeTab, addGroup, addTab, closeGroup, closePane, closeTab, cycleGroup, cycleTab, findPane, focusSide, newWorkspace, selectGroup, splitPane, tabAt, toggleZoom, updateActiveTab, updateTab, type Workspace } from '../common/layout'
import { api, baseName, commit, newId, say, toFolio, ui, ws } from './store'
import * as agents from './agents'
import * as terminals from './terminals'

export interface Command {
  id: string
  title: string
  group: string
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
  const next = addGroup(w(), newId, { name: baseName(cwd) || 'Группа', cwd })
  commit(next)
  const g = activeGroup(next)
  ui.dialog = { kind: 'group', id: g.id, name: g.name, color: g.color, isNew: true }
}

/** The focused pane's repository (or its folder, for a project) handed to folio. */
async function folioRepo(kind: 'review' | 'project'): Promise<void> {
  const cwd = terminals.paneCwd(focusedPane())
  if (!cwd) return say('Папка панели неизвестна')
  const repo = (await api.changesBaseline(cwd, 'head'))?.root
  if (kind === 'review' && !repo) return say('Папка панели — не репозиторий git')
  toFolio(kind === 'review' ? { review: repo } : { project: repo ?? cwd })
}

function fontBy(delta: number | null): void {
  ui.fontDelta = delta === null ? 0 : Math.max(-6, Math.min(24, ui.fontDelta + delta))
  terminals.restyle()
}

const list: Command[] = [
  { id: 'palette.open', group: 'Окно', title: 'Палитра команд', run: () => (ui.palette = !ui.palette) },
  { id: 'sidebar.toggle', group: 'Окно', title: 'Свернуть или развернуть панель групп', run: () => commit({ ...w(), sidebarCollapsed: !w().sidebarCollapsed }) },
  { id: 'config.open', group: 'Окно', title: 'Открыть config.toml', run: () => api.openConfig() },
  { id: 'data.open', group: 'Окно', title: 'Открыть папку данных shell-data', run: () => api.openDataDir() },
  {
    id: 'commander.toggle', group: 'Файлы', title: 'Файловые панели (как в Midnight Commander)',
    // A full-screen program (vim, less, mc itself) keeps the keys.
    when: () => ui.commander || terminals.get(focusedPane())?.term.buffer !== terminals.get(focusedPane())?.term.alt,
    run: () => (ui.commander = !ui.commander),
  },
  { id: 'changes.toggle', group: 'Агенты', title: 'Изменения агента: показать или скрыть', run: () => (ui.changesOpen = !ui.changesOpen) },
  { id: 'claude.hooksOn', group: 'Агенты', title: 'Claude Code: точные статусы через хуки (~/.claude/settings.json)', run: () => void api.claudeHooks(true).then(say) },
  { id: 'claude.hooksOff', group: 'Агенты', title: 'Claude Code: убрать хуки shell', run: () => void api.claudeHooks(false).then(say) },
  { id: 'folio.review', group: 'folio', title: 'folio: ревью изменений репозитория текущей панели', hidden: () => !ui.folio, run: () => void folioRepo('review') },
  { id: 'folio.project', group: 'folio', title: 'folio: открыть папку текущей панели как проект', hidden: () => !ui.folio, run: () => void folioRepo('project') },
  { id: 'update.check', group: 'Окно', title: 'Проверить обновления', run: () => api.checkUpdate() },
  { id: 'update.restart', group: 'Окно', title: 'Перезапустить и обновить', run: () => api.restartToUpdate() },
  { id: 'font.bigger', group: 'Окно', title: 'Крупнее шрифт', run: () => fontBy(1) },
  { id: 'font.smaller', group: 'Окно', title: 'Мельче шрифт', run: () => fontBy(-1) },
  { id: 'font.reset', group: 'Окно', title: 'Обычный размер шрифта', run: () => fontBy(null) },

  { id: 'group.new', group: 'Группы', title: 'Новая группа в папке текущей панели', run: newGroupHere },
  {
    id: 'group.rename', group: 'Группы', title: 'Переименовать группу или сменить цвет',
    run: () => {
      const g = activeGroup(w())
      ui.dialog = { kind: 'group', id: g.id, name: g.name, color: g.color, profile: g.profile ?? '' }
    },
  },
  { id: 'group.close', group: 'Группы', title: 'Закрыть группу', run: () => commit(closeGroup(w(), activeGroup(w()).id, newId)) },
  { id: 'group.next', group: 'Группы', title: 'Следующая группа', run: () => commit(cycleGroup(w(), 1)) },
  { id: 'group.prev', group: 'Группы', title: 'Предыдущая группа', run: () => commit(cycleGroup(w(), -1)) },

  { id: 'tab.new', group: 'Вкладки', title: 'Новая вкладка', run: () => commit(addTab(w(), newId, { cwd: terminals.paneCwd(focusedPane()) })) },
  { id: 'tab.close', group: 'Вкладки', title: 'Закрыть вкладку', run: () => commit(closeTab(w(), activeTab(activeGroup(w())).id, newId)) },
  { id: 'tab.next', group: 'Вкладки', title: 'Следующая вкладка', run: () => commit(cycleTab(w(), 1)) },
  { id: 'tab.prev', group: 'Вкладки', title: 'Предыдущая вкладка', run: () => commit(cycleTab(w(), -1)) },
  {
    id: 'tab.rename', group: 'Вкладки', title: 'Переименовать вкладку или сменить цвет',
    run: () => {
      const t = activeTab(activeGroup(w()))
      ui.dialog = { kind: 'tab', id: t.id, name: t.name ?? '', color: t.color ?? null }
    },
  },

  { id: 'pane.splitRight', group: 'Панели', title: 'Разделить вправо', run: () => commit(updateActiveTab(w(), (t) => splitPane(t, t.focus, 'row', newId))) },
  { id: 'pane.splitDown', group: 'Панели', title: 'Разделить вниз', run: () => commit(updateActiveTab(w(), (t) => splitPane(t, t.focus, 'column', newId))) },
  { id: 'pane.close', group: 'Панели', title: 'Закрыть панель', run: () => closePaneById(focusedPane()) },
  { id: 'pane.zoom', group: 'Панели', title: 'Панель на всю вкладку и обратно', run: () => commit(updateActiveTab(w(), toggleZoom)) },
  { id: 'pane.focusLeft', group: 'Панели', title: 'Панель слева', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'left'))) },
  { id: 'pane.focusRight', group: 'Панели', title: 'Панель справа', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'right'))) },
  { id: 'pane.focusUp', group: 'Панели', title: 'Панель выше', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'up'))) },
  { id: 'pane.focusDown', group: 'Панели', title: 'Панель ниже', run: () => commit(updateActiveTab(w(), (t) => focusSide(t, 'down'))) },

  { id: 'terminal.clear', group: 'Терминал', title: 'Очистить экран и прокрутку', run: () => focusedView()?.clear() },
  { id: 'terminal.find', group: 'Терминал', title: 'Найти в выводе', run: () => (ui.find = { query: ui.find?.query ?? '', count: 0, index: 0 }) },
  {
    id: 'terminal.copy', group: 'Терминал', title: 'Копировать выделенное',
    run: () => {
      const text = focusedView()?.getSelection()
      if (text) api.copy(text)
    },
  },
  {
    id: 'terminal.paste', group: 'Терминал', title: 'Вставить',
    run: () => {
      const id = focusedPane()
      void api.paste().then((text) => {
        const e = terminals.get(id)
        if (!e || !text) return
        e.view.clearSelection()
        e.view.scrollToBottom()
        e.term.paste(text)
      })
    },
  },
  { id: 'terminal.selectAll', group: 'Терминал', title: 'Выделить весь вывод', run: () => focusedView()?.selectAll() },
  { id: 'terminal.prevCommand', group: 'Терминал', title: 'К предыдущей команде', run: () => void focusedView()?.scrollToCommand(-1) },
  { id: 'terminal.nextCommand', group: 'Терминал', title: 'К следующей команде', run: () => void focusedView()?.scrollToCommand(1) },
]

for (let i = 1; i <= 9; i++) {
  list.push({ id: `tab.select.${i}`, group: 'Вкладки', title: i === 9 ? 'Последняя вкладка' : `Вкладка ${i}`, hidden: true, run: () => commit(tabAt(w(), i)) })
  list.push({
    id: `group.select.${i}`, group: 'Группы', title: `Группа ${i}`, hidden: true,
    run: () => {
      const g = w().groups[i - 1]
      if (g) commit(selectGroup(w(), g.id))
    },
  })
}

export const COMMANDS = new Map(list.map((c) => [c.id, c]))

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
