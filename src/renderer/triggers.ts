/**
 * Triggers in the window: each pane's output read line by line against the
 * config's `[[triggers]]` (common/triggers.ts); a notification, a mark on the
 * tab, a text typed in. Highlights are drawn by the panes' views themselves.
 */
import { TriggerRunner, type Trigger } from '../common/triggers'
import { activeGroup, activeTab, allPanes, findPane, panes } from '../common/layout'
import { inSight } from './agents'
import { api, say, ui, ws } from './store'
import { tabTitle } from './titles'
import * as terminals from './terminals'
import { showPane } from './requests'

const runners = new Map<string, TriggerRunner>()
let shape = ''
/** When a trigger last acted in a pane: a notification or a text not repeated within a few seconds. */
const last = new Map<string, number>()

function runnerOf(paneId: string): TriggerRunner | null {
  const list = ui.settings?.config.triggers ?? []
  const now = JSON.stringify(list)
  if (now !== shape) {
    shape = now
    runners.clear()
  }
  if (!list.some((t) => t.action !== 'highlight')) return null
  let r = runners.get(paneId)
  if (!r) runners.set(paneId, (r = new TriggerRunner(list)))
  return r
}

function tabOf(paneId: string) {
  return ws.value?.groups.flatMap((g) => g.tabs).find((t) => findPane(t.root, paneId))
}

function soon(paneId: string, t: Trigger, ms: number): boolean {
  const key = `${paneId}|${t.pattern}|${t.action}`
  const at = Date.now()
  if (at - (last.get(key) ?? 0) < ms) return true
  last.set(key, at)
  return false
}

export function onOutput(paneId: string, data: string): void {
  const r = runnerOf(paneId)
  if (!r) return
  for (const { trigger, line } of r.feed(data)) {
    switch (trigger.action) {
      case 'notify': {
        if (soon(paneId, trigger, 5000)) break
        const tab = tabOf(paneId)
        if (inSight(paneId)) say(`Триггер: ${line.trim().slice(0, 120)}`)
        else {
          const n = new Notification(tab ? tabTitle(tab) : 'shell', { body: line.trim().slice(0, 200) })
          n.onclick = () => showPane(paneId)
        }
        break
      }
      case 'mark':
        if (!inSight(paneId)) ui.marked[paneId] = true
        break
      case 'send': {
        const e = terminals.get(paneId)
        if (!e || e.exited || soon(paneId, trigger, 2000)) break
        api.write(paneId, trigger.text ?? '')
        break
      }
    }
  }
}

/** The tab in front: its marks seen; closed panes' readers let go. */
export function seen(): void {
  const w = ws.value
  if (!w) return
  for (const p of panes(activeTab(activeGroup(w)).root)) if (ui.marked[p.id]) delete ui.marked[p.id]
  const alive = new Set(allPanes(w).map((p) => p.id))
  for (const id of runners.keys()) if (!alive.has(id)) runners.delete(id)
  for (const id of Object.keys(ui.marked)) if (!alive.has(id)) delete ui.marked[id]
}
