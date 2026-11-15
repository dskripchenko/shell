import '@dskripchenko/ui/styles/tokens.css'
import '@dskripchenko/ui/styles/themes.css'
import '@dskripchenko/ui/styles/fonts.css'
import './style.css'
import { createApp } from 'vue'
import { activeGroup, activeTab, allPanes, newWorkspace, setPaneCwd } from '../common/layout'
import type { Settings } from '../common/ipc'
import * as agents from './agents'
import App from './App.vue'
import { closePaneById, run } from './commands'
import { install, rebuild } from './keyboard'
import { handle as handleRequest, showPane } from './requests'
import * as triggers from './triggers'
import { useLang } from './i18n'
import { api, commit, findFolio, newId, onCommit, ui, ws } from './store'
import * as terminals from './terminals'
import { onUpdateInfo } from './updates'
import { applyChrome, currentTheme } from './theme'

async function start(): Promise<void> {
  const s = await api.startup()
  ui.platform = s.platform
  ui.os = s.os
  ui.quake = s.quake
  ui.home = s.home
  ui.version = s.version
  ui.settings = s.settings
  useLang(s.settings.lang)
  document.documentElement.dataset.platform = s.platform
  applyChrome(currentTheme())
  rebuild()

  terminals.setReplays(s.replay)
  onCommit((next) => {
    terminals.prune(next)
    triggers.seen()
  })
  const initial = s.workspace ?? newWorkspace(newId, s.home)
  ws.value = initial
  terminals.startAll(initial)
  if (!s.workspace) api.saveWorkspace(initial)

  api.onData((paneId, data) => {
    terminals.write(paneId, data)
    agents.onOutput(paneId)
    triggers.onOutput(paneId, data)
  })
  api.onEvents((paneId, events) => {
    agents.onEvents(paneId, events)
    if (events.some((e) => e.kind === 'prompt')) agents.onPrompt(paneId)
    for (const e of events) {
      if (e.kind === 'start') ui.busy[paneId] = true
      else if (e.kind === 'prompt') {
        ui.busy[paneId] = false
        terminals.atPrompt(paneId)
      }
    }
  })
  api.onAgentSignal((s) => agents.onSignal(s))
  onCommit((next) => agents.prune(next))
  setInterval(agents.tick, 1000)
  agents.setShowPane(showPane)
  api.onApiRequest(handleRequest)
  api.onExit((paneId, code) => terminals.onExit(paneId, code, closePaneById))
  api.onCommand((command) => run(command))
  // The panes' views made again only when what they draw with changed: a view made again loses its selection.
  const drawnWith = (x: Settings | null | undefined) => JSON.stringify(x ? [x.config.font, x.config.theme, x.config.triggers, x.config.profiles, x.themes] : null)
  api.onSettings((settings) => {
    const before = drawnWith(ui.settings)
    ui.settings = settings
    useLang(settings.lang)
    rebuild()
    applyChrome(currentTheme())
    if (drawnWith(settings) !== before) terminals.restyle()
  })
  // folio: looked for at start, after a change of settings and when the window comes back.
  void findFolio()
  void api.projects().then((list) => (ui.projects = list))
  api.onProjects((list) => (ui.projects = list))
  api.onSettings(() => void findFolio())
  window.addEventListener('focus', () => void findFolio())
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    ui.systemDark = e.matches
    applyChrome(currentTheme())
    terminals.restyle()
  })

  // The focused pane's folder and branch: asked now and then, remembered for the next start.
  const probe = async () => {
    const w = ws.value
    if (!w || document.hidden) return
    const paneId = activeTab(activeGroup(w)).focus
    const cwd = (await api.cwd(paneId)) ?? terminals.paneCwd(paneId)
    if (cwd) {
      if (ui.cwds[paneId] !== cwd) ui.cwds[paneId] = cwd
      const cur = ws.value
      if (cur) {
        const next = setPaneCwd(cur, paneId, cwd)
        if (JSON.stringify(next) !== JSON.stringify(cur)) commit(next)
      }
    }
    ui.branch = cwd ? await api.gitBranch(cwd) : null
  }
  setInterval(() => void probe(), 2000)

  // The tabs' git status: the active group's, every few seconds while the window is seen.
  const gitProbe = async () => {
    const w = ws.value
    if (!w || document.hidden) return
    const tabs = activeGroup(w).tabs.map((t) => [t.id, terminals.paneCwd(t.focus)] as const)
    const byCwd = await api.gitStatus(tabs.map(([, c]) => c).filter((c): c is string => !!c))
    const next: typeof ui.git = {}
    for (const [id, cwd] of tabs) next[id] = cwd ? (byCwd[cwd] ?? null) : null
    if (JSON.stringify(next) !== JSON.stringify(ui.git)) ui.git = next
  }
  setInterval(() => void gitProbe(), 4000)
  onCommit((next, prev) => {
    if (!prev || next.activeGroup !== prev.activeGroup) void gitProbe()
  })
  onCommit((next, prev) => {
    if (!prev || activeTab(activeGroup(next)).focus !== activeTab(activeGroup(prev)).focus) void probe()
  })

  if (s.e2e) {
    // What the tests read: every pane's whole buffer, hidden tabs too.
    ;(window as unknown as { shellTest: object }).shellTest = {
      text: () => (ws.value ? allPanes(ws.value).map((p) => terminals.bufferText(p.id)).join('\n') : ''),
      selection: () => (ws.value ? (terminals.get(activeTab(activeGroup(ws.value)).focus)?.view.getSelection() ?? '') : ''),
    }
  }
  ui.update = await api.updateState()
  api.onUpdate(onUpdateInfo)
  install()
  createApp(App).mount('#app')
}

void start()
