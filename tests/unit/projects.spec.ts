import { describe, expect, it } from 'vitest'
import { panes, type Group } from '../../src/common/layout'
import { byRecent, groupOf, isProject, projectAt, projectOf, readProjects, relativeTo, resolveIn, type Project } from '../../src/common/projects'

const ids = () => {
  let n = 0
  return () => `n${++n}`
}

const group: Group = {
  id: 'g',
  name: 'app',
  color: '#60a5fa',
  cwd: '/w/app',
  profile: 'node',
  tabs: [
    {
      id: 't1',
      name: 'agents',
      root: { kind: 'split', dir: 'row', sizes: [0.6, 0.4], children: [{ kind: 'pane', id: 'a', cwd: '/w/app' }, { kind: 'pane', id: 'b', cwd: '/w/app/web', profile: 'node' }] },
      focus: 'b',
    },
    { id: 't2', color: '#fbbf24', root: { kind: 'pane', id: 'c', cwd: '/tmp' }, focus: 'c' },
  ],
  activeTab: 't2',
}

describe('projects', () => {
  it('keeps folders by their place in the root', () => {
    expect(relativeTo('/w/app', '/w/app')).toBe('')
    expect(relativeTo('/w/app/', '/w/app/src/x')).toBe('src/x')
    expect(relativeTo('/w/app', '/w/apple')).toBeNull()
    expect(relativeTo('C:\\w\\app', 'C:\\w\\app\\src')).toBe('src')
    expect(resolveIn('/w/app', 'src/x')).toBe('/w/app/src/x')
    expect(resolveIn('/w/app', '')).toBe('/w/app')
    expect(resolveIn('/w/app', '/tmp')).toBe('/tmp')
    expect(resolveIn('C:\\w\\app', 'src/x')).toBe('C:\\w\\app\\src\\x')
  })

  it('saves a group’s layout with its agents, and brings it back with new ids', () => {
    const live: Record<string, string> = { a: '/w/app/api' }
    const project = projectOf(group, { id: 'p', root: '/w/app', opened: 5 }, (id) => live[id], (id) => (id === 'a' ? 'claude' : undefined))
    expect(project).toEqual({
      id: 'p',
      name: 'app',
      root: '/w/app',
      color: '#60a5fa',
      profile: 'node',
      activeTab: 1,
      opened: 5,
      tabs: [
        {
          name: 'agents',
          focus: 1,
          root: { kind: 'split', dir: 'row', sizes: [0.6, 0.4], children: [{ kind: 'pane', cwd: 'api', command: 'claude' }, { kind: 'pane', cwd: 'web', profile: 'node' }] },
        },
        { color: '#fbbf24', focus: 0, root: { kind: 'pane', cwd: '/tmp' } },
      ],
    })
    expect(isProject(project)).toBe(true)

    // Opened elsewhere: the same layout under the new root.
    const { group: back, commands } = groupOf({ ...project, root: '/other/app' }, ids())
    expect(back.project).toBe('p')
    expect(back.cwd).toBe('/other/app')
    expect(back.profile).toBe('node')
    expect(back.tabs.map((t) => panes(t.root).map((p) => p.cwd))).toEqual([['/other/app/api', '/other/app/web'], ['/tmp']])
    const first = panes(back.tabs[0]!.root)
    expect(back.tabs[0]!.focus).toBe(first[1]!.id)
    expect(back.activeTab).toBe(back.tabs[1]!.id)
    expect([...commands]).toEqual([[first[0]!.id, 'claude']])
    expect(new Set([back.id, ...back.tabs.map((t) => t.id), ...back.tabs.flatMap((t) => panes(t.root).map((p) => p.id))]).size).toBe(6)
  })

  it('finds the project of a folder, the deepest; most recent first', () => {
    const p = (id: string, root: string, opened = 0): Project => ({ id, name: id, root, color: '#fff', tabs: [], activeTab: 0, opened })
    const list = [p('w', '/w', 1), p('app', '/w/app', 3), p('x', '/x', 2)]
    expect(projectAt(list, '/w/app/src')?.id).toBe('app')
    expect(projectAt(list, '/w/lib')?.id).toBe('w')
    expect(projectAt(list, '/y')).toBeUndefined()
    expect(byRecent(list).map((x) => x.id)).toEqual(['app', 'x', 'w'])
    // An empty project opens one tab at its root.
    expect(panes(groupOf(p('e', '/e'), ids()).group.tabs[0]!.root)[0]!.cwd).toBe('/e')
  })

  it('reads a file of projects, leaving out what is broken', () => {
    const good = { id: 'p', name: 'p', root: '/p', color: '#fff', tabs: [{ root: { kind: 'pane' }, focus: 0 }], activeTab: 0, opened: 0 }
    expect(readProjects({ projects: [good, { ...good, root: '' }, { ...good, tabs: [{ root: { kind: 'split', dir: 'row', sizes: [], children: [] }, focus: 0 }] }, null] })).toEqual([good])
    expect(readProjects('x')).toEqual([])
  })
})
