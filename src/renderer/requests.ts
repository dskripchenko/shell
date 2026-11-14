/**
 * Other programs' requests (folio over the local API, src/main/api.ts):
 * a tab opened in a folder, a text pasted into the agent's pane of a
 * repository, a review waiting shown on the repository's tabs.
 */
import { addTab, allPanes, findPane, focusPane, selectGroup, selectTab, updateActiveTab, updateTab, activeGroup, activeTab, type Workspace } from '../common/layout'
import { projectAt, relativeTo } from '../common/projects'
import type { ApiReply, ApiRequest } from '../common/ipc'
import { api, commit, newId, say, ui, ws } from './store'
import * as terminals from './terminals'

/** A pane brought into sight: its group, its tab, focused. */
export function showPane(paneId: string): void {
  const w = ws.value
  if (!w) return
  const g = w.groups.find((x) => x.tabs.some((t) => findPane(t.root, paneId)))
  const t = g?.tabs.find((x) => findPane(x.root, paneId))
  if (g && t) commit(updateActiveTab(selectTab(w, t.id), (tab) => focusPane(tab, paneId)))
}

/** The group a folder belongs to: its project's open group, else the one whose folder holds it (the deepest), else the active one. */
function groupFor(w: Workspace, cwd: string): string {
  const project = projectAt(ui.projects, cwd)
  const linked = project && w.groups.find((g) => g.project === project.id)
  if (linked) return linked.id
  const holding = w.groups.filter((g) => g.cwd && relativeTo(g.cwd, cwd) !== null).sort((a, b) => b.cwd!.length - a.cwd!.length)[0]
  return (holding ?? activeGroup(w)).id
}

function openTab(cwd: string, name?: string): ApiReply {
  let next = selectGroup(ws.value!, groupFor(ws.value!, cwd))
  next = addTab(next, newId, { cwd })
  const tab = activeTab(activeGroup(next))
  if (name) next = updateTab(next, tab.id, { name })
  commit(next)
  return { status: 200, body: { pane: tab.focus } }
}

/**
 * The panes in a repository and the repository's root as those panes see it:
 * folders compared with their links resolved (folio says `/private/var/…`,
 * a shell `/var/…`), each pane's own spelling of the root kept.
 */
async function panesIn(repo: string): Promise<{ panes: string[]; roots: string[] }> {
  const w = ws.value!
  const ids = allPanes(w)
    .map((p) => p.id)
    .filter((id) => !!terminals.paneCwd(id))
  const cwds = ids.map((id) => terminals.paneCwd(id)!)
  const [realRepo, ...real] = await api.realpaths([repo, ...cwds])
  const panes: string[] = []
  const roots = new Set([repo])
  ids.forEach((id, i) => {
    const rel = relativeTo(realRepo!, real[i]!) ?? relativeTo(repo, cwds[i]!)
    if (rel === null) return
    panes.push(id)
    const cwd = cwds[i]!
    // The root in the pane's spelling: its folder less the part below the root.
    const parts = rel === '' ? 0 : rel.split(/[\\/]/).length
    roots.add(parts === 0 ? cwd : cwd.split(/[\\/]/).slice(0, -parts).join(cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'))
  })
  return { panes, roots: [...roots] }
}

/** The pane for a repository's text: an agent's there (one waiting first, then the focused one), else a shell there. */
async function paneFor(repo: string): Promise<string | null> {
  const focused = activeTab(activeGroup(ws.value!)).focus
  const rank = (id: string) => {
    const a = ui.agents[id]
    const agent = a && !a.ended
    return (agent ? 4 : 0) + (agent && a.status === 'waiting' ? 2 : 0) + (id === focused ? 1 : 0)
  }
  return (await panesIn(repo)).panes.sort((a, b) => rank(b) - rank(a))[0] ?? null
}

async function paste(repo: string, text: string): Promise<ApiReply> {
  const paneId = await paneFor(repo)
  const e = paneId ? terminals.get(paneId) : undefined
  if (!paneId || !e) return { status: 404, body: { error: 'no pane in this repository' } }
  showPane(paneId)
  e.view.scrollToBottom()
  e.term.paste(text)
  e.view.focus()
  say('Текст из folio вставлен в панель — отправьте его сами')
  const agent = ui.agents[paneId]
  return { status: 200, body: { pane: paneId, ...(agent && !agent.ended ? { agent: agent.name } : {}) } }
}

async function review(repo: string, state: 'waiting' | 'none', message?: string): Promise<ApiReply> {
  if (state === 'none') {
    delete ui.reviews[repo]
    return { status: 204 }
  }
  const { roots } = await panesIn(repo)
  ui.reviews[repo] = { message: message ?? 'ждёт ревью', roots }
  if (!document.hasFocus() && ui.settings?.config.agents.notify !== false) {
    const n = new Notification('Ревью в folio', { body: `${message ?? 'Агент ждёт ответа'} — ${repo}` })
    n.onclick = () => void paneFor(repo).then((paneId) => paneId && showPane(paneId))
  }
  return { status: 204 }
}

export function handle(request: ApiRequest): ApiReply | Promise<ApiReply> {
  if (!ws.value) return { status: 503 }
  switch (request.kind) {
    case 'open-tab':
      return openTab(request.cwd, request.name)
    case 'paste':
      return paste(request.repo, request.text)
    case 'review':
      return review(request.repo, request.state, request.message)
  }
}

/** The review waiting for a pane's repository, if any. */
export function reviewOf(paneIds: string[]): string | null {
  for (const id of paneIds) {
    const cwd = terminals.paneCwd(id)
    if (!cwd) continue
    for (const r of Object.values(ui.reviews)) if (r.roots.some((root) => relativeTo(root, cwd) !== null)) return r.message
  }
  return null
}
