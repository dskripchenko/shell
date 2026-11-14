import '@dskripchenko/ui/styles/tokens.css'
import '@dskripchenko/ui/styles/themes.css'
import '@dskripchenko/ui/styles/fonts.css'
import './style.css'
import { createApp } from 'vue'
import { activeGroup, activeTab, newWorkspace, setPaneCwd } from '../common/layout'
import App from './App.vue'
import { closePaneById, run } from './commands'
import { install, rebuild } from './keyboard'
import { api, commit, newId, onCommit, ui, ws } from './store'
import * as terminals from './terminals'
import { applyChrome, currentTheme } from './theme'

async function start(): Promise<void> {
  const s = await api.startup()
  ui.platform = s.platform
  ui.quake = s.quake
  ui.home = s.home
  ui.version = s.version
  ui.settings = s.settings
  document.documentElement.dataset.platform = s.platform
  applyChrome(currentTheme())
  rebuild()

  terminals.setReplays(s.replay)
  onCommit((next) => terminals.prune(next))
  const initial = s.workspace ?? newWorkspace(newId, s.home)
  ws.value = initial
  terminals.startAll(initial)
  if (!s.workspace) api.saveWorkspace(initial)

  api.onData((paneId, data) => terminals.write(paneId, data))
  api.onExit((paneId, code) => terminals.onExit(paneId, code, closePaneById))
  api.onCommand((command) => run(command))
  api.onSettings((settings) => {
    ui.settings = settings
    rebuild()
    applyChrome(currentTheme())
    terminals.restyle()
  })
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
  onCommit((next, prev) => {
    if (!prev || activeTab(activeGroup(next)).focus !== activeTab(activeGroup(prev)).focus) void probe()
  })

  install()
  createApp(App).mount('#app')
}

void start()
