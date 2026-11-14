/**
 * Projects: a folder with a name, a colour and a saved layout — the tabs of a
 * group, their splits, each pane's folder and profile, and the agent that ran
 * in it. Opening a project brings its group back as it was saved, the agents
 * started again; a project already open is switched to.
 *
 * Folders inside the project are kept relative to its root, so a moved or
 * cloned project opens the same.
 */
import { COLORS, panes, type Direction, type Group, type NewId, type PaneNode, type Tab } from './layout'

export interface PaneTemplate {
  kind: 'pane'
  /** Relative to the project's root ('' — the root), or absolute when outside it. */
  cwd?: string
  profile?: string
  /** A command typed at the pane's first prompt (an agent). */
  command?: string
}

export interface SplitTemplate {
  kind: 'split'
  dir: Direction
  sizes: number[]
  children: NodeTemplate[]
}

export type NodeTemplate = PaneTemplate | SplitTemplate

export interface TabTemplate {
  name?: string
  color?: string
  root: NodeTemplate
  /** The focused pane, by its place among the tab's panes. */
  focus: number
}

export interface Project {
  id: string
  name: string
  root: string
  color: string
  profile?: string
  tabs: TabTemplate[]
  activeTab: number
  /** When last opened (ms), for the switcher's order. */
  opened: number
}

const sepOf = (path: string) => (path.includes('\\') && !path.includes('/') ? '\\' : '/')

/** `path` relative to `root` ('' for the root itself), or null when outside it. */
export function relativeTo(root: string, path: string): string | null {
  const sep = sepOf(root)
  const r = root.endsWith(sep) ? root.slice(0, -1) : root
  if (path === r) return ''
  if (!path.startsWith(r + sep)) return null
  return path.slice(r.length + 1)
}

/** A folder of a template back to a full path. */
export function resolveIn(root: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return root
  if (cwd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\')) return cwd
  const sep = sepOf(root)
  return (root.endsWith(sep) ? root : root + sep) + cwd.split('/').join(sep)
}

function templateOfNode(node: PaneNode, root: string, cwdOf: (id: string) => string | undefined, commandOf: (id: string) => string | undefined): NodeTemplate {
  if (node.kind === 'split') return { kind: 'split', dir: node.dir, sizes: [...node.sizes], children: node.children.map((c) => templateOfNode(c, root, cwdOf, commandOf)) }
  const out: PaneTemplate = { kind: 'pane' }
  const cwd = cwdOf(node.id) ?? node.cwd
  if (cwd !== undefined) {
    const rel = relativeTo(root, cwd)
    out.cwd = rel === null ? cwd : rel.split('\\').join('/')
  }
  if (node.profile) out.profile = node.profile
  const command = commandOf(node.id)
  if (command) out.command = command
  return out
}

/** A group's layout as a project's: folders by their place in the root, agents by their command. */
export function projectOf(
  group: Group,
  base: { id: string; root: string; opened: number },
  cwdOf: (paneId: string) => string | undefined,
  commandOf: (paneId: string) => string | undefined,
): Project {
  const tabs = group.tabs.map((t): TabTemplate => {
    const ids = panes(t.root).map((p) => p.id)
    const tab: TabTemplate = { root: templateOfNode(t.root, base.root, cwdOf, commandOf), focus: Math.max(0, ids.indexOf(t.focus)) }
    if (t.name) tab.name = t.name
    if (t.color) tab.color = t.color
    return tab
  })
  const project: Project = { id: base.id, name: group.name, root: base.root, color: group.color, tabs, activeTab: Math.max(0, group.tabs.findIndex((t) => t.id === group.activeTab)), opened: base.opened }
  if (group.profile) project.profile = group.profile
  return project
}

/** A project's group, with new ids, and the commands to type in its panes once their shells are ready. */
export function groupOf(project: Project, newId: NewId): { group: Group; commands: Map<string, string> } {
  const commands = new Map<string, string>()
  const build = (node: NodeTemplate): PaneNode => {
    if (node.kind === 'split') return { kind: 'split', dir: node.dir, sizes: [...node.sizes], children: node.children.map(build) }
    const id = newId()
    if (node.command) commands.set(id, node.command)
    return { kind: 'pane', id, cwd: resolveIn(project.root, node.cwd), ...(node.profile ? { profile: node.profile } : {}) }
  }
  const templates = project.tabs.length ? project.tabs : [{ root: { kind: 'pane' }, focus: 0 } as TabTemplate]
  const tabs = templates.map((t): Tab => {
    const root = build(t.root)
    const ids = panes(root).map((p) => p.id)
    return { id: newId(), root, focus: ids[t.focus] ?? ids[0]!, ...(t.name ? { name: t.name } : {}), ...(t.color ? { color: t.color } : {}) }
  })
  const group: Group = {
    id: newId(),
    name: project.name,
    color: project.color,
    cwd: project.root,
    project: project.id,
    tabs,
    activeTab: (tabs[project.activeTab] ?? tabs[0]!).id,
    ...(project.profile ? { profile: project.profile } : {}),
  }
  return { group, commands }
}

/** The project whose root holds `path` (the deepest one), if any. */
export function projectAt(projects: Project[], path: string): Project | undefined {
  return projects.filter((p) => relativeTo(p.root, path) !== null).sort((a, b) => b.root.length - a.root.length)[0]
}

/** Most recently opened first. */
export function byRecent(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => b.opened - a.opened || a.name.localeCompare(b.name))
}

function isNode(v: unknown, depth = 0): v is NodeTemplate {
  if (!v || typeof v !== 'object' || depth > 32) return false
  const n = v as Record<string, unknown>
  if (n.kind === 'pane') return [n.cwd, n.profile, n.command].every((x) => x === undefined || typeof x === 'string')
  return (
    n.kind === 'split' &&
    (n.dir === 'row' || n.dir === 'column') &&
    Array.isArray(n.children) &&
    Array.isArray(n.sizes) &&
    n.children.length === n.sizes.length &&
    n.children.length > 0 &&
    n.sizes.every((s) => typeof s === 'number' && Number.isFinite(s)) &&
    n.children.every((c) => isNode(c, depth + 1))
  )
}

export function isProject(v: unknown): v is Project {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.root === 'string' &&
    p.root !== '' &&
    typeof p.color === 'string' &&
    (p.profile === undefined || typeof p.profile === 'string') &&
    Array.isArray(p.tabs) &&
    p.tabs.every((t) => !!t && typeof t === 'object' && isNode((t as TabTemplate).root) && Number.isInteger((t as TabTemplate).focus)) &&
    Number.isInteger(p.activeTab) &&
    typeof p.opened === 'number'
  )
}

/** The projects of a file, the broken ones left out. */
export function readProjects(v: unknown): Project[] {
  const list = v && typeof v === 'object' && Array.isArray((v as { projects?: unknown }).projects) ? (v as { projects: unknown[] }).projects : []
  return list.filter(isProject)
}

export function projectColor(projects: Project[]): string {
  const taken = projects.map((p) => p.color)
  return COLORS.find((c) => !taken.includes(c)) ?? COLORS[projects.length % COLORS.length]!
}
