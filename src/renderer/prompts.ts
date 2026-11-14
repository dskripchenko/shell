/** The prompt library in the window: a prompt's places filled in and pasted into the focused pane, without Enter. */
import { activeGroup, activeTab } from '../common/layout'
import { fillPrompt, placesIn, type Places, type Prompt } from '../common/prompts'
import { api, say, ui, ws } from './store'
import * as terminals from './terminals'
import { m } from './i18n'

/** The file in the viewer, as a full path. */
function viewerFile(): string {
  const v = ui.viewer
  if (!v) return ''
  if (/^([\\/]|[A-Za-z]:[\\/])/.test(v.path) || !v.cwd) return v.path
  const sep = v.cwd.includes('\\') && !v.cwd.includes('/') ? '\\' : '/'
  return v.cwd.replace(/[\\/]$/, '') + sep + v.path
}

export async function usePrompt(p: Prompt): Promise<void> {
  const paneId = activeTab(activeGroup(ws.value!)).focus
  const e = terminals.get(paneId)
  if (!e) return
  const used = placesIn(p.text)
  const places: Places = {
    selection: e.view.getSelection(),
    file: viewerFile(),
    cwd: terminals.paneCwd(paneId) ?? '',
    branch: ui.branch ?? '',
    ...(used.has('clipboard') ? { clipboard: await api.paste() } : {}),
  }
  e.view.clearSelection()
  e.view.scrollToBottom()
  terminals.typing(e)
  e.term.paste(fillPrompt(p.text, places))
  e.view.focus()
  say(m().say.promptPasted(p.name))
}

/** What is selected in the focused pane, kept as a new prompt. */
export async function saveSelection(): Promise<void> {
  const e = terminals.get(activeTab(activeGroup(ws.value!)).focus)
  const text = e?.view.getSelection().trim() ?? ''
  if (!text) return say(m().say.selectForPrompt)
  const name = text.split(/\s+/).slice(0, 6).join(' ')
  const file = await api.addPrompt(name, text)
  say(file ? m().say.promptSaved(file) : m().say.promptNotSaved)
}
