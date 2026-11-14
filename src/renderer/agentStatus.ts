import { strongest, type AgentStatus } from '../common/agents'
import { panes, type Group, type Tab } from '../common/layout'
import { ui } from './store'

/** What a tab shows: the agent among its panes that most needs the person. */
export function tabStatus(tab: Tab): AgentStatus | null {
  return strongest(panes(tab.root).map((p) => ui.agents[p.id]))
}

export function groupStatus(group: Group): AgentStatus | null {
  return strongest(group.tabs.flatMap((t) => panes(t.root).map((p) => ui.agents[p.id])))
}
