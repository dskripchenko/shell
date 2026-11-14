import { describe, expect, it } from 'vitest'
import {
  activeGroup,
  activeTab,
  addGroup,
  addTab,
  closePane,
  closeTab,
  cycleGroup,
  focusSide,
  isWorkspace,
  moveTab,
  neighbour,
  newWorkspace,
  panes,
  rects,
  resizeSplit,
  splitPane,
  tabAt,
  toggleZoom,
  updateActiveTab,
  updateTab,
  type Tab,
} from '../../src/common/layout'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

describe('workspace: groups and tabs', () => {
  it('starts with one group, one tab, one pane in the folder given', () => {
    const ws = newWorkspace(ids(), '/home/me')
    expect(ws.groups).toHaveLength(1)
    const tab = activeTab(activeGroup(ws))
    expect(panes(tab.root)).toEqual([{ kind: 'pane', id: tab.focus, cwd: '/home/me' }])
  })

  it('a new group takes a colour no other group has, and becomes active', () => {
    const id = ids()
    let ws = newWorkspace(id)
    ws = addGroup(ws, id, { name: 'shell', cwd: '/w/shell' })
    expect(ws.groups[1]!.color).not.toBe(ws.groups[0]!.color)
    expect(activeGroup(ws).name).toBe('shell')
    expect(activeTab(activeGroup(ws)).root).toMatchObject({ cwd: '/w/shell' })
  })

  it('a new tab goes right after the active one and starts in the group folder', () => {
    const id = ids()
    let ws = addGroup(newWorkspace(id), id, { name: 'g', cwd: '/g' })
    const first = activeTab(activeGroup(ws)).id
    ws = addTab(ws, id)
    ws = addTab(ws, id)
    const g = activeGroup(ws)
    expect(g.tabs).toHaveLength(3)
    expect(g.tabs[0]!.id).toBe(first)
    expect(g.activeTab).toBe(g.tabs[2]!.id)
    expect(g.tabs[1]!.root).toMatchObject({ cwd: '/g' })
  })

  it('tabs by place, 9 being the last; going round groups', () => {
    const id = ids()
    let ws = newWorkspace(id)
    ws = addTab(addTab(addTab(ws, id), id), id)
    const tabs = activeGroup(ws).tabs
    expect(activeGroup(tabAt(ws, 2)).activeTab).toBe(tabs[1]!.id)
    expect(activeGroup(tabAt(ws, 9)).activeTab).toBe(tabs[3]!.id)
    expect(activeGroup(tabAt(ws, 7)).activeTab).toBe(activeGroup(ws).activeTab)
    ws = addGroup(ws, id, { name: 'b' })
    expect(cycleGroup(ws, 1).activeGroup).toBe(ws.groups[0]!.id)
    expect(cycleGroup(ws, -1).activeGroup).toBe(ws.groups[0]!.id)
  })

  it('closing the active tab selects the one in its place; the last tab closes its group', () => {
    const id = ids()
    let ws = addTab(addTab(newWorkspace(id), id), id)
    const [a, b, c] = activeGroup(ws).tabs
    ws = closeTab(ws, c!.id, id)
    expect(activeGroup(ws).activeTab).toBe(b!.id)
    ws = addGroup(ws, id, { name: 'other' })
    const other = activeGroup(ws)
    ws = closeTab(ws, other.tabs[0]!.id, id)
    expect(ws.groups.map((g) => g.name)).toEqual(['Основная'])
    expect(activeGroup(ws).tabs.map((t) => t.id)).toEqual([a!.id, b!.id])
  })

  it('a name and colour given by hand; an empty name gives the name back to the shell', () => {
    const id = ids()
    let ws = newWorkspace(id)
    const tab = activeTab(activeGroup(ws))
    ws = updateTab(ws, tab.id, { name: '  claude · pty ', color: '#2dd4bf' })
    expect(activeTab(activeGroup(ws))).toMatchObject({ name: 'claude · pty', color: '#2dd4bf' })
    ws = updateTab(ws, tab.id, { name: '', color: null })
    expect(activeTab(activeGroup(ws)).name).toBeUndefined()
    expect(activeTab(activeGroup(ws)).color).toBeUndefined()
  })

  it('a tab moved within its group', () => {
    const id = ids()
    let ws = addTab(addTab(newWorkspace(id), id), id)
    const [a, b, c] = activeGroup(ws).tabs.map((t) => t.id)
    ws = moveTab(ws, c!, 0)
    expect(activeGroup(ws).tabs.map((t) => t.id)).toEqual([c, a, b])
  })
})

describe('panes: splitting, closing, moving between them', () => {
  const tabWith = (): { tab: Tab; id: () => string } => {
    const id = ids()
    const ws = newWorkspace(id, '/w')
    return { tab: activeTab(activeGroup(ws)), id }
  }

  it('a split puts the new pane after the old one, in its folder, with the focus', () => {
    const { tab, id } = tabWith()
    const first = tab.focus
    const t = splitPane(tab, first, 'row', id)
    expect(panes(t.root).map((p) => p.id)).toEqual([first, t.focus])
    expect(panes(t.root)[1]).toMatchObject({ cwd: '/w' })
    expect(t.root).toMatchObject({ kind: 'split', dir: 'row', sizes: [0.5, 0.5] })
  })

  it('splitting the same way again adds a sibling sharing the room, not a nested split', () => {
    const { tab, id } = tabWith()
    let t = splitPane(tab, tab.focus, 'row', id)
    t = splitPane(t, t.focus, 'row', id)
    expect(t.root).toMatchObject({ kind: 'split', dir: 'row', sizes: [0.5, 0.25, 0.25] })
    t = splitPane(t, t.focus, 'column', id)
    expect(t.root.kind === 'split' && t.root.children[2]).toMatchObject({ kind: 'split', dir: 'column' })
  })

  it('places and neighbours: left, right, up, down', () => {
    const { tab, id } = tabWith()
    const a = tab.focus
    let t = splitPane(tab, a, 'row', id)
    const b = t.focus
    t = splitPane(t, b, 'column', id)
    const c = t.focus
    const r = rects(t.root)
    expect(r.get(a)).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    expect(r.get(c)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
    expect(neighbour(t.root, a, 'right')).toBe(b) // b and c are as near: the upper one
    expect(neighbour(t.root, c, 'left')).toBe(a)
    expect(neighbour(t.root, c, 'up')).toBe(b)
    expect(neighbour(t.root, b, 'down')).toBe(c)
    expect(neighbour(t.root, a, 'left')).toBeNull()
    expect(focusSide({ ...t, focus: c }, 'up').focus).toBe(b)
  })

  it('closing a pane gives its room to the others and the focus to the one before it', () => {
    const { tab, id } = tabWith()
    const a = tab.focus
    let t = splitPane(tab, a, 'row', id)
    t = splitPane(t, t.focus, 'row', id)
    const [, b, c] = panes(t.root).map((p) => p.id)
    const closed = closePane({ ...t, focus: b! }, b!)!
    expect(panes(closed.root).map((p) => p.id)).toEqual([a, c])
    expect(closed.focus).toBe(a)
    expect(closed.root).toMatchObject({ sizes: [2 / 3, 1 / 3] })
    const one = closePane(closed, c!)!
    expect(one.root).toMatchObject({ kind: 'pane', id: a })
    expect(closePane(one, a)).toBeNull()
  })

  it('zoom shows the focused pane alone and comes back; splitting ends it', () => {
    const { tab, id } = tabWith()
    let t = splitPane(tab, tab.focus, 'row', id)
    t = toggleZoom(t)
    expect(t.zoomed).toBe(t.focus)
    expect(toggleZoom(t).zoomed).toBeUndefined()
    expect(splitPane(t, t.focus, 'column', id).zoomed).toBeUndefined()
  })

  it('a border dragged keeps both sides above the least share', () => {
    expect(resizeSplit([0.5, 0.5], 0, 0.1)).toEqual([0.6, 0.4])
    const [a, b] = resizeSplit([0.5, 0.5], 0, 0.9)
    expect(a).toBeCloseTo(0.92)
    expect(b).toBeCloseTo(0.08)
    expect(resizeSplit([0.5, 0.5], 1, 0.1)).toEqual([0.5, 0.5])
  })

  it('updates go to the active tab only', () => {
    const id = ids()
    let ws = addTab(newWorkspace(id), id)
    ws = updateActiveTab(ws, (t) => splitPane(t, t.focus, 'row', id))
    const [first, second] = activeGroup(ws).tabs
    expect(first!.root.kind).toBe('pane')
    expect(second!.root.kind).toBe('split')
  })
})

describe('a saved workspace read back', () => {
  it('keeps one of the right shape and refuses the rest', () => {
    const id = ids()
    const ws = newWorkspace(id)
    expect(isWorkspace(JSON.parse(JSON.stringify(ws)))).toBe(true)
    expect(isWorkspace({ groups: [], activeGroup: 'x' })).toBe(false)
    expect(isWorkspace({ ...ws, groups: [{ ...ws.groups[0], tabs: [{ id: 't', focus: 'p', root: { kind: 'split', dir: 'row', children: [], sizes: [] } }] }] })).toBe(false)
    expect(isWorkspace(null)).toBe(false)
  })
})

describe('profiles and moving tabs between groups', () => {
  it('a group’s profile goes to its new tabs and on to their splits', async () => {
    const { addGroup: add, addTab: tab, activeGroup: g, activeTab: t, splitPane: split, updateGroup, newWorkspace: fresh, panes: all } = await import('../../src/common/layout')
    const id = ids()
    let ws = add(fresh(id), id, { name: 'py', profile: 'python' })
    expect(all(t(g(ws)).root)[0]).toMatchObject({ profile: 'python' })
    ws = updateGroup(ws, g(ws).id, { profile: 'node' })
    ws = tab(ws, id)
    const pane = t(g(ws))
    expect(all(pane.root)[0]).toMatchObject({ profile: 'node' })
    expect(all(split(pane, pane.focus, 'row', id).root)[1]).toMatchObject({ profile: 'node' })
    expect(updateGroup(ws, g(ws).id, { profile: null }).groups.at(-1)!.profile).toBeUndefined()
  })

  it('a tab moved to another group goes last there; the group it left closes when empty', async () => {
    const { addGroup: add, addTab: tab, moveTabToGroup, newWorkspace: fresh } = await import('../../src/common/layout')
    const id = ids()
    let ws = tab(fresh(id), id)
    const first = ws.groups[0]!
    ws = add(ws, id, { name: 'b' })
    const second = ws.groups[1]!
    const moving = first.tabs[1]!.id
    ws = moveTabToGroup(ws, moving, second.id, id)
    expect(ws.groups[0]!.tabs).toHaveLength(1)
    expect(ws.groups[1]!.tabs.map((x) => x.id)).toEqual([second.tabs[0]!.id, moving])
    expect(ws.activeGroup).toBe(second.id)
    expect(ws.groups[1]!.activeTab).toBe(moving)
    const lastOfFirst = ws.groups[0]!.tabs[0]!.id
    ws = moveTabToGroup(ws, lastOfFirst, second.id, id)
    expect(ws.groups.map((x) => x.name)).toEqual(['b'])
    expect(ws.groups[0]!.tabs).toHaveLength(3)
  })
})
