/**
 * The last session, kept in the data folder: the workspace (groups, tabs,
 * panes, their folders), the window's place, and each pane's last output.
 * Written atomically — a crash mid-write leaves the previous copy.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWorkspace, type Workspace } from '../common/layout'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
  maximized?: boolean
}

interface Saved {
  workspace?: unknown
  bounds?: Bounds
}

export function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

export class SessionStore {
  private readonly file: string
  private readonly scrollbackDir: string
  private saved: Saved = {}

  /** `name` tells the main window's session from the drop-down one's. */
  constructor(dir: string, name: string) {
    this.file = join(dir, `${name}.json`)
    this.scrollbackDir = join(dir, 'scrollback', name)
    try {
      this.saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved
    } catch {
      this.saved = {}
    }
  }

  workspace(): Workspace | null {
    return isWorkspace(this.saved.workspace) ? this.saved.workspace : null
  }

  bounds(): Bounds | null {
    const b = this.saved.bounds
    return b && [b.x, b.y, b.width, b.height].every((n) => Number.isFinite(n)) ? b : null
  }

  save(patch: { workspace?: Workspace; bounds?: Bounds }): void {
    this.saved = { ...this.saved, ...patch }
    mkdirSync(join(this.file, '..'), { recursive: true })
    writeAtomic(this.file, JSON.stringify(this.saved))
  }

  /** The panes' last output, by pane. */
  readScrollback(): Record<string, string> {
    const out: Record<string, string> = {}
    if (!existsSync(this.scrollbackDir)) return out
    for (const name of readdirSync(this.scrollbackDir)) {
      const id = name.replace(/\.log$/, '')
      if (!name.endsWith('.log') || !SAFE_ID.test(id)) continue
      try {
        out[id] = readFileSync(join(this.scrollbackDir, name), 'utf8')
      } catch {
        // Unreadable: that pane starts empty.
      }
    }
    return out
  }

  /** The panes' last output written; panes no longer there are forgotten. */
  writeScrollback(tails: Map<string, string>, keep: Set<string>): void {
    mkdirSync(this.scrollbackDir, { recursive: true })
    for (const [id, text] of tails) {
      if (!SAFE_ID.test(id) || !keep.has(id)) continue
      writeAtomic(join(this.scrollbackDir, `${id}.log`), text)
    }
    for (const name of readdirSync(this.scrollbackDir)) {
      const id = name.replace(/\.(log|tmp)$/, '').replace(/\.log$/, '')
      if (!keep.has(id)) rmSync(join(this.scrollbackDir, name), { force: true })
    }
  }

  clearScrollback(): void {
    rmSync(this.scrollbackDir, { recursive: true, force: true })
  }
}
