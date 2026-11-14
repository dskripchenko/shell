/**
 * The agents in the panes: what each is doing, told by its pane's events and
 * output (src/common/agents.ts), shown on its tab and group, and said by the
 * system when it waits or is done while its pane is not in sight.
 */
import type { ShellEvent } from '@dskripchenko/shell-integration'
import { nextAgent, type AgentInput, type AgentState } from '../common/agents'
import { activeGroup, activeTab, allPanes, findPane, type Workspace } from '../common/layout'
import { api, ui, ws } from './store'

function agentsList(): string[] {
  return ui.settings?.config.agents.commands ?? []
}

/** Where a pane is: its group and tab, for a notification's words and for showing it. */
function placeOf(w: Workspace, paneId: string): { group: string; groupId: string; tabId: string } | null {
  for (const g of w.groups) for (const t of g.tabs) if (findPane(t.root, paneId)) return { group: g.name, groupId: g.id, tabId: t.id }
  return null
}

/** Whether the person sees this pane now: the window focused, its tab shown, it focused. */
function inSight(paneId: string): boolean {
  const w = ws.value
  if (!w || !document.hasFocus() || document.hidden) return false
  return activeTab(activeGroup(w)).focus === paneId
}

let onShow: ((paneId: string) => void) | null = null

/** What showing a pane takes (selecting its group and tab, focusing it): given by the app. */
export function setShowPane(f: (paneId: string) => void): void {
  onShow = f
}

function tell(paneId: string, before: AgentState | undefined, after: AgentState | null): void {
  if (!after || before?.status === after.status || inSight(paneId)) return
  if (ui.settings?.config.agents.notify === false) return
  if (after.status !== 'waiting' && after.status !== 'done' && after.status !== 'failed') return
  const place = ws.value ? placeOf(ws.value, paneId) : null
  const title = `${after.name}${place ? ` · ${place.group}` : ''}`
  const body = after.status === 'waiting' ? (after.message ?? 'ждёт ввода') : after.status === 'done' ? 'закончил' : 'завершился с ошибкой'
  try {
    const n = new Notification(title, { body, silent: after.status === 'done' })
    n.onclick = () => {
      window.focus()
      onShow?.(paneId)
    }
  } catch {
    // No notifications here: the tab's mark says it.
  }
}

function apply(paneId: string, input: AgentInput): void {
  const before = ui.agents[paneId]
  const after = nextAgent(before ?? null, input, Date.now(), agentsList())
  if (after === (before ?? null)) return
  if (after) ui.agents[paneId] = after
  else delete ui.agents[paneId]
  tell(paneId, before, after)
}

export function onEvents(paneId: string, events: ShellEvent[]): void {
  for (const e of events) {
    if (e.kind === 'command') apply(paneId, { kind: 'command', text: e.text })
    else if (e.kind === 'end') apply(paneId, { kind: 'end', code: e.code })
    else if (e.kind === 'notify') apply(paneId, { kind: 'notify', text: e.text })
    else if (e.kind === 'bell') apply(paneId, { kind: 'bell' })
  }
}

export function onSignal(s: { paneId: string; state: 'running' | 'waiting' | 'done'; agent?: string; message?: string }): void {
  apply(s.paneId, { kind: 'signal', state: s.state, agent: s.agent, message: s.message })
}

export function onOutput(paneId: string): void {
  if (ui.agents[paneId]) apply(paneId, { kind: 'output' })
}

/** What the terminal sends: keys typed — not its answers to a program's questions (cursor place, attributes). */
export function onInput(paneId: string, data: string): void {
  if (!ui.agents[paneId]) return
  // eslint-disable-next-line no-control-regex -- an answer starts with ESC
  if (/^\x1b\[[\d;?>=]*[Rcnyt]$/.test(data) || data.startsWith('\x1b]') || data === '\x1b[I' || data === '\x1b[O') return
  apply(paneId, { kind: 'input' })
}

/** Time passing and the person looking: run every second. */
export function tick(): void {
  for (const id of Object.keys(ui.agents)) {
    apply(id, { kind: 'tick' })
    if (inSight(id)) apply(id, { kind: 'seen' })
  }
}

/** Agents of panes that went away are forgotten. */
export function prune(w: Workspace): void {
  const keep = new Set(allPanes(w).map((p) => p.id))
  for (const id of Object.keys(ui.agents)) if (!keep.has(id)) delete ui.agents[id]
}

/** Commands to type into a pane once its shell shows its first prompt (an agent started from the palette). */
const pendingCommands = new Map<string, string>()

export function typeWhenReady(paneId: string, command: string): void {
  pendingCommands.set(paneId, command)
  // A shell without the marks never says it is ready: typed after a moment anyway.
  setTimeout(() => flush(paneId), 4000)
}

export function onPrompt(paneId: string): void {
  flush(paneId)
}

function flush(paneId: string): void {
  const command = pendingCommands.get(paneId)
  if (command === undefined) return
  pendingCommands.delete(paneId)
  api.write(paneId, command + '\r')
}
