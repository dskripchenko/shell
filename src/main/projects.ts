/**
 * The projects, kept in the data folder (`projects.json`), written
 * atomically. Shared by the windows: a change is told to each.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readProjects, type Project } from '../common/projects'
import { writeAtomic } from './session'

export class ProjectsStore {
  private readonly file: string
  private list: Project[]

  constructor(private readonly dir: string) {
    this.file = join(dir, 'projects.json')
    try {
      this.list = readProjects(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      this.list = []
    }
  }

  all(): Project[] {
    return this.list
  }

  /** The list replaced; what does not read as a project is left out. */
  save(value: unknown): Project[] {
    this.list = readProjects({ projects: value })
    mkdirSync(this.dir, { recursive: true })
    writeAtomic(this.file, JSON.stringify({ projects: this.list }, null, 2))
    return this.list
  }
}
