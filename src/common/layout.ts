/**
 * The workspace: groups of tabs, each tab a tree of panes split in rows and
 * columns. Plain data — saved as is between runs — and pure functions over it:
 * every change returns a new workspace and leaves the old one as it was.
 */

export type Direction = 'row' | 'column'
export type Side = 'left' | 'right' | 'up' | 'down'

export interface PaneLeaf {
  kind: 'pane'
  id: string
  /** The folder the shell was last seen in (OSC 7), for the next start. */
  cwd?: string
  /** The profile its shell was started with (config.toml [profiles.<name>]); none: the default shell. */
  profile?: string
}

export interface PaneSplit {
  kind: 'split'
  dir: Direction
  children: PaneNode[]
  /** Each child's share of the split, summing to 1. */
  sizes: number[]
}

export type PaneNode = PaneLeaf | PaneSplit

export interface Tab {
  id: string
  /** A name given by hand; none: the name comes from the shell (title, folder). */
  name?: string
  color?: string
  root: PaneNode
  focus: string
  /** A pane shown alone, the others kept. */
  zoomed?: string
}

export interface Group {
  id: string
  name: string
  color: string
  /** Where new tabs of the group start. */
  cwd?: string
  /** The profile new tabs of the group start with. */
  profile?: string
  /** The project the group was opened from (projects.ts): opening it again comes here. */
  project?: string
  tabs: Tab[]
  activeTab: string
}

export interface Workspace {
  groups: Group[]
  activeGroup: string
  sidebarCollapsed: boolean
}

export type NewId = () => string

/** Colours for new groups and tabs, in order (UID Design System, dark theme). */
export const COLORS = ['#2dd4bf', '#60a5fa', '#fbbf24', '#fb7185', '#34d399', '#c4b5fd', '#a1a1aa']

export function freeColor(taken: string[]): string {
  return COLORS.find((c) => !taken.includes(c)) ?? COLORS[taken.length % COLORS.length]!
}

// Reading ------------------------------------------------------------------------------

export function activeGroup(ws: Workspace): Group {
  return ws.groups.find((g) => g.id === ws.activeGroup) ?? ws.groups[0]!
}

export function activeTab(group: Group): Tab {
  return group.tabs.find((t) => t.id === group.activeTab) ?? group.tabs[0]!
}

export function panes(node: PaneNode): PaneLeaf[] {
  return node.kind === 'pane' ? [node] : node.children.flatMap(panes)
}

export function allPanes(ws: Workspace): PaneLeaf[] {
  return ws.groups.flatMap((g) => g.tabs.flatMap((t) => panes(t.root)))
}

export function findPane(node: PaneNode, id: string): PaneLeaf | undefined {
  return panes(node).find((p) => p.id === id)
}

/** Each pane's place in the tab, as fractions of its width and height. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function rects(node: PaneNode, area: Rect = { x: 0, y: 0, w: 1, h: 1 }): Map<string, Rect> {
  const out = new Map<string, Rect>()
  const walk = (n: PaneNode, r: Rect): void => {
    if (n.kind === 'pane') {
      out.set(n.id, r)
      return
    }
    let at = 0
    n.children.forEach((child, i) => {
      const share = n.sizes[i] ?? 1 / n.children.length
      walk(child, n.dir === 'row' ? { x: r.x + at * r.w, y: r.y, w: share * r.w, h: r.h } : { x: r.x, y: r.y + at * r.h, w: r.w, h: share * r.h })
      at += share
    })
  }
  walk(node, area)
  return out
}

/** The pane next to `from` on a side: the one touching that edge, nearest to its middle. */
export function neighbour(node: PaneNode, from: string, side: Side): string | null {
  const all = rects(node)
  const a = all.get(from)
  if (!a) return null
  const eps = 1e-6
  let best: { id: string; d: number } | null = null
  for (const [id, b] of all) {
    if (id === from) continue
    const touches =
      side === 'left' ? Math.abs(b.x + b.w - a.x) < eps : side === 'right' ? Math.abs(a.x + a.w - b.x) < eps : side === 'up' ? Math.abs(b.y + b.h - a.y) < eps : Math.abs(a.y + a.h - b.y) < eps
    if (!touches) continue
    const horizontal = side === 'left' || side === 'right'
    const overlap = horizontal ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    if (overlap <= eps) continue
    const d = horizontal ? Math.abs(b.y + b.h / 2 - (a.y + a.h / 2)) : Math.abs(b.x + b.w / 2 - (a.x + a.w / 2))
    if (!best || d < best.d) best = { id, d }
  }
  return best?.id ?? null
}

// Building -----------------------------------------------------------------------------

export function newTab(newId: NewId, opts: { cwd?: string; name?: string; color?: string; profile?: string } = {}): Tab {
  const pane: PaneLeaf = { kind: 'pane', id: newId(), ...(opts.cwd ? { cwd: opts.cwd } : {}), ...(opts.profile ? { profile: opts.profile } : {}) }
  return { id: newId(), root: pane, focus: pane.id, ...(opts.name ? { name: opts.name } : {}), ...(opts.color ? { color: opts.color } : {}) }
}

export function newGroup(newId: NewId, opts: { name: string; color?: string; cwd?: string; profile?: string; taken?: string[] }): Group {
  const tab = newTab(newId, { cwd: opts.cwd, profile: opts.profile })
  return { id: newId(), name: opts.name, color: opts.color ?? freeColor(opts.taken ?? []), ...(opts.cwd ? { cwd: opts.cwd } : {}), ...(opts.profile ? { profile: opts.profile } : {}), tabs: [tab], activeTab: tab.id }
}

export function newWorkspace(newId: NewId, cwd?: string): Workspace {
  const group = newGroup(newId, { name: 'Основная', cwd })
  return { groups: [group], activeGroup: group.id, sidebarCollapsed: false }
}

// Changing -----------------------------------------------------------------------------

function mapGroup(ws: Workspace, id: string, f: (g: Group) => Group): Workspace {
  return { ...ws, groups: ws.groups.map((g) => (g.id === id ? f(g) : g)) }
}

function mapTab(group: Group, id: string, f: (t: Tab) => Tab): Group {
  return { ...group, tabs: group.tabs.map((t) => (t.id === id ? f(t) : t)) }
}

/** The active tab of the active group, changed. */
export function updateActiveTab(ws: Workspace, f: (t: Tab) => Tab): Workspace {
  const g = activeGroup(ws)
  return mapGroup(ws, g.id, (group) => mapTab(group, activeTab(group).id, f))
}

export function addGroup(ws: Workspace, newId: NewId, opts: { name: string; color?: string; cwd?: string; profile?: string }): Workspace {
  const group = newGroup(newId, { ...opts, taken: ws.groups.map((g) => g.color) })
  return { ...ws, groups: [...ws.groups, group], activeGroup: group.id }
}

/** A group made elsewhere (a project's) put last and shown; its colour kept. */
export function insertGroup(ws: Workspace, group: Group): Workspace {
  return { ...ws, groups: [...ws.groups, group], activeGroup: group.id }
}

/** A group linked to a project, or no longer (null). */
export function linkGroup(ws: Workspace, id: string, project: string | null): Workspace {
  return mapGroup(ws, id, (g) => {
    const next: Group = { ...g }
    if (project === null) delete next.project
    else next.project = project
    return next
  })
}

export function selectGroup(ws: Workspace, id: string): Workspace {
  return ws.groups.some((g) => g.id === id) ? { ...ws, activeGroup: id } : ws
}

/** The group `step` places away from the active one, going round. */
export function cycleGroup(ws: Workspace, step: number): Workspace {
  const i = ws.groups.findIndex((g) => g.id === ws.activeGroup)
  const n = ws.groups.length
  return { ...ws, activeGroup: ws.groups[(((i + step) % n) + n) % n]!.id }
}

export function closeGroup(ws: Workspace, id: string, newId: NewId): Workspace {
  const groups = ws.groups.filter((g) => g.id !== id)
  if (groups.length === 0) return newWorkspace(newId)
  const at = ws.groups.findIndex((g) => g.id === id)
  const activeGroup = ws.activeGroup === id ? groups[Math.min(at, groups.length - 1)]!.id : ws.activeGroup
  return { ...ws, groups, activeGroup }
}

export function updateGroup(ws: Workspace, id: string, patch: { name?: string; color?: string; cwd?: string; profile?: string | null }): Workspace {
  return mapGroup(ws, id, (g) => {
    const { profile, ...rest } = patch
    const next: Group = { ...g, ...rest }
    if (profile === null || profile === '') delete next.profile
    else if (profile !== undefined) next.profile = profile
    return next
  })
}

export function addTab(ws: Workspace, newId: NewId, opts: { cwd?: string; profile?: string } = {}): Workspace {
  const g = activeGroup(ws)
  const tab = newTab(newId, { cwd: opts.cwd ?? g.cwd, profile: opts.profile ?? g.profile })
  const at = g.tabs.findIndex((t) => t.id === g.activeTab)
  const tabs = [...g.tabs.slice(0, at + 1), tab, ...g.tabs.slice(at + 1)]
  return mapGroup(ws, g.id, (group) => ({ ...group, tabs, activeTab: tab.id }))
}

export function selectTab(ws: Workspace, id: string): Workspace {
  const g = ws.groups.find((group) => group.tabs.some((t) => t.id === id))
  if (!g) return ws
  return { ...mapGroup(ws, g.id, (group) => ({ ...group, activeTab: id })), activeGroup: g.id }
}

export function cycleTab(ws: Workspace, step: number): Workspace {
  const g = activeGroup(ws)
  const i = g.tabs.findIndex((t) => t.id === g.activeTab)
  const n = g.tabs.length
  return mapGroup(ws, g.id, (group) => ({ ...group, activeTab: g.tabs[(((i + step) % n) + n) % n]!.id }))
}

/** The tab at a place in the active group (1-based, as the keys ⌘1…⌘9 say); 9 is the last. */
export function tabAt(ws: Workspace, place: number): Workspace {
  const g = activeGroup(ws)
  const tab = place >= 9 ? g.tabs.at(-1) : g.tabs[place - 1]
  return tab ? selectTab(ws, tab.id) : ws
}

/** A tab closed; the last tab of a group closes the group. */
export function closeTab(ws: Workspace, id: string, newId: NewId): Workspace {
  const g = ws.groups.find((group) => group.tabs.some((t) => t.id === id))
  if (!g) return ws
  if (g.tabs.length === 1) return closeGroup(ws, g.id, newId)
  const at = g.tabs.findIndex((t) => t.id === id)
  const tabs = g.tabs.filter((t) => t.id !== id)
  const activeTab = g.activeTab === id ? tabs[Math.min(at, tabs.length - 1)]!.id : g.activeTab
  return mapGroup(ws, g.id, (group) => ({ ...group, tabs, activeTab }))
}

export function updateTab(ws: Workspace, id: string, patch: { name?: string | null; color?: string | null }): Workspace {
  const g = ws.groups.find((group) => group.tabs.some((t) => t.id === id))
  if (!g) return ws
  return mapGroup(ws, g.id, (group) =>
    mapTab(group, id, (t) => {
      const next = { ...t }
      if (patch.name !== undefined) {
        if (patch.name === null || patch.name.trim() === '') delete next.name
        else next.name = patch.name.trim()
      }
      if (patch.color !== undefined) {
        if (patch.color === null) delete next.color
        else next.color = patch.color
      }
      return next
    }),
  )
}

/** A tab moved to another place in its group. */
export function moveTab(ws: Workspace, id: string, to: number): Workspace {
  const g = ws.groups.find((group) => group.tabs.some((t) => t.id === id))
  if (!g) return ws
  const tab = g.tabs.find((t) => t.id === id)!
  const rest = g.tabs.filter((t) => t.id !== id)
  const at = Math.max(0, Math.min(to, rest.length))
  return mapGroup(ws, g.id, (group) => ({ ...group, tabs: [...rest.slice(0, at), tab, ...rest.slice(at)] }))
}

/** A tab moved to the end of another group, which becomes the active one with it. */
export function moveTabToGroup(ws: Workspace, tabId: string, groupId: string, newId: NewId): Workspace {
  const from = ws.groups.find((g) => g.tabs.some((t) => t.id === tabId))
  const to = ws.groups.find((g) => g.id === groupId)
  if (!from || !to || from.id === to.id) return ws
  const tab = from.tabs.find((t) => t.id === tabId)!
  // The last tab leaving closes its group, as closing it would.
  const left = from.tabs.length === 1 ? closeGroup(ws, from.id, newId) : closeTab(ws, tabId, newId)
  return {
    ...left,
    groups: left.groups.map((g) => (g.id === to.id ? { ...g, tabs: [...g.tabs, tab], activeTab: tab.id } : g)),
    activeGroup: to.id,
  }
}

/** A pane split in two: the new one goes after it (right or below) and takes the focus. */
export function splitPane(tab: Tab, paneId: string, dir: Direction, newId: NewId): Tab {
  const from = findPane(tab.root, paneId)
  const added: PaneLeaf = { kind: 'pane', id: newId(), ...(from?.cwd ? { cwd: from.cwd } : {}), ...(from?.profile ? { profile: from.profile } : {}) }
  const walk = (n: PaneNode): PaneNode => {
    if (n.kind === 'pane') return n.id === paneId ? { kind: 'split', dir, children: [n, added], sizes: [0.5, 0.5] } : n
    // Split in the direction the parent already goes: a sibling, sharing the pane's room.
    const i = n.children.findIndex((c) => c.kind === 'pane' && c.id === paneId)
    if (i >= 0 && n.dir === dir) {
      const half = n.sizes[i]! / 2
      return { ...n, children: [...n.children.slice(0, i + 1), added, ...n.children.slice(i + 1)], sizes: [...n.sizes.slice(0, i), half, half, ...n.sizes.slice(i + 1)] }
    }
    return { ...n, children: n.children.map(walk) }
  }
  const { zoomed: _zoomed, ...rest } = tab
  void _zoomed
  return { ...rest, root: walk(tab.root), focus: added.id }
}

/** A pane closed: its room goes to its neighbours; null when it was the tab's last. */
export function closePane(tab: Tab, paneId: string): Tab | null {
  if (tab.root.kind === 'pane') return tab.root.id === paneId ? null : tab
  const order = panes(tab.root).map((p) => p.id)
  const walk = (n: PaneNode): PaneNode | null => {
    if (n.kind === 'pane') return n.id === paneId ? null : n
    const kept: PaneNode[] = []
    const sizes: number[] = []
    n.children.forEach((c, i) => {
      const w = walk(c)
      if (w) {
        kept.push(w)
        sizes.push(n.sizes[i] ?? 0)
      }
    })
    if (kept.length === 0) return null
    if (kept.length === 1) return kept[0]!
    const sum = sizes.reduce((a, b) => a + b, 0)
    return { ...n, children: kept, sizes: sizes.map((s) => s / sum) }
  }
  const root = walk(tab.root)
  if (!root) return null
  let focus = tab.focus
  if (focus === paneId) {
    const at = order.indexOf(paneId)
    const left = panes(root).map((p) => p.id)
    focus = order.slice(0, at).reverse().find((id) => left.includes(id)) ?? left[0]!
  }
  const next: Tab = { ...tab, root, focus }
  if (next.zoomed === paneId) delete next.zoomed
  return next
}

export function focusPane(tab: Tab, paneId: string): Tab {
  return findPane(tab.root, paneId) ? { ...tab, focus: paneId } : tab
}

export function focusSide(tab: Tab, side: Side): Tab {
  const id = neighbour(tab.root, tab.focus, side)
  return id ? { ...tab, focus: id } : tab
}

export function toggleZoom(tab: Tab): Tab {
  if (tab.root.kind === 'pane') return tab
  if (tab.zoomed) {
    const { zoomed: _z, ...rest } = tab
    void _z
    return rest
  }
  return { ...tab, zoomed: tab.focus }
}

/** The sizes of a split, set by dragging the border after child `index`; shares stay above `min`. */
export function resizeSplit(sizes: number[], index: number, delta: number, min = 0.08): number[] {
  const a = sizes[index]
  const b = sizes[index + 1]
  if (a === undefined || b === undefined) return sizes
  const d = Math.max(min - a, Math.min(b - min, delta))
  const out = [...sizes]
  out[index] = a + d
  out[index + 1] = b - d
  return out
}

/** The split holding a path of child indexes, changed. */
export function updateSplit(root: PaneNode, path: number[], f: (s: PaneSplit) => PaneSplit): PaneNode {
  if (root.kind === 'pane') return root
  if (path.length === 0) return f(root)
  const [head, ...rest] = path
  return { ...root, children: root.children.map((c, i) => (i === head ? updateSplit(c, rest, f) : c)) }
}

/** The pane's folder, remembered for the next start. */
export function setPaneCwd(ws: Workspace, paneId: string, cwd: string): Workspace {
  const walk = (n: PaneNode): PaneNode => (n.kind === 'pane' ? (n.id === paneId ? { ...n, cwd } : n) : { ...n, children: n.children.map(walk) })
  return { ...ws, groups: ws.groups.map((g) => ({ ...g, tabs: g.tabs.map((t) => ({ ...t, root: walk(t.root) })) })) }
}

/** A workspace read from disk, kept only when it has the shape this one has. */
export function isWorkspace(v: unknown): v is Workspace {
  const node = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return false
    const o = n as Record<string, unknown>
    if (o.kind === 'pane') return typeof o.id === 'string'
    return o.kind === 'split' && (o.dir === 'row' || o.dir === 'column') && Array.isArray(o.children) && o.children.length > 0 && o.children.every(node) && Array.isArray(o.sizes) && o.sizes.length === o.children.length
  }
  if (!v || typeof v !== 'object') return false
  const w = v as Record<string, unknown>
  return (
    Array.isArray(w.groups) &&
    w.groups.length > 0 &&
    typeof w.activeGroup === 'string' &&
    w.groups.every((g: unknown) => {
      const o = g as Record<string, unknown>
      return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.color === 'string' && Array.isArray(o.tabs) && o.tabs.length > 0 && typeof o.activeTab === 'string' && (o.tabs as unknown[]).every((t) => {
        const tab = t as Record<string, unknown>
        return !!tab && typeof tab.id === 'string' && typeof tab.focus === 'string' && node(tab.root)
      })
    })
  )
}
