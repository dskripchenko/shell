/**
 * Projects in the window: a group saved as a project (its layout and agents),
 * a project opened (its group brought back, the agents started again, or the
 * group shown when it is open already), a project forgotten.
 */
import { activeGroup, activeTab, insertGroup, linkGroup, selectGroup } from '../common/layout'
import { byRecent, groupOf, projectOf, type Project } from '../common/projects'
import { typeWhenReady } from './agents'
import { api, commit, newId, say, ui, ws } from './store'
import * as terminals from './terminals'

function save(list: Project[]): void {
  ui.projects = list
  api.saveProjects(JSON.parse(JSON.stringify(list)) as Project[])
}

/** The active group saved as a project: the one it was opened from, or a new one at its repository's root. */
export async function saveGroupAsProject(): Promise<void> {
  const w = ws.value!
  const g = activeGroup(w)
  const own = ui.projects.find((p) => p.id === g.project)
  let root = own?.root
  if (!root) {
    const cwd = terminals.paneCwd(activeTab(g).focus) ?? g.cwd ?? ui.home
    root = (await api.changesBaseline(cwd, 'head'))?.root ?? cwd
  }
  const commandOf = (id: string) => {
    const a = ui.agents[id]
    return a && !a.ended ? a.name : undefined
  }
  const project = projectOf(g, { id: own?.id ?? newId(), root, opened: Date.now() }, (id) => terminals.paneCwd(id), commandOf)
  save([...ui.projects.filter((p) => p.id !== project.id), project])
  if (g.project !== project.id) commit(linkGroup(ws.value!, g.id, project.id))
  say(own ? `Раскладка проекта «${project.name}» сохранена` : `Проект «${project.name}» сохранён: ${root}`)
}

/** A project shown: its open group, or its group brought back with its agents. */
export function openProject(id: string): void {
  const project = ui.projects.find((p) => p.id === id)
  if (!project) return
  const w = ws.value!
  const open = w.groups.find((g) => g.project === id)
  if (open) commit(selectGroup(w, open.id))
  else {
    const { group, commands } = groupOf(project, newId)
    commit(insertGroup(w, group))
    for (const [paneId, command] of commands) typeWhenReady(paneId, command)
  }
  save(ui.projects.map((p) => (p.id === id ? { ...p, opened: Date.now() } : p)))
}

/** The active group's project forgotten (the group stays, no longer linked). */
export function forgetProject(): void {
  const w = ws.value!
  const g = activeGroup(w)
  const project = ui.projects.find((p) => p.id === g.project)
  if (!project) return say('Группа не связана с проектом')
  save(ui.projects.filter((p) => p.id !== project.id))
  let next = w
  for (const x of w.groups) if (x.project === project.id) next = linkGroup(next, x.id, null)
  commit(next)
  say(`Проект «${project.name}» удалён из списка`)
}

export function recentProjects(): Project[] {
  return byRecent(ui.projects)
}
