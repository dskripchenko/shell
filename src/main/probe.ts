/**
 * What can be learned about a pane without the shell's help: the folder its
 * shell is in (asked of the system), and the git branch of a folder (read from
 * `.git`, no git program run). Shell integration (stage 2) will tell both.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export function processCwd(pid: number, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  if (platform === 'linux') {
    try {
      return Promise.resolve(readlinkSync(`/proc/${pid}/cwd`))
    } catch {
      return Promise.resolve(null)
    }
  }
  if (platform !== 'darwin') return Promise.resolve(null)
  return new Promise((done) => {
    execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 2000 }, (err, out) => {
      if (err) return done(null)
      const line = out.split('\n').find((l) => l.startsWith('n'))
      done(line ? line.slice(1) : null)
    })
  })
}

/** The branch checked out in the repository holding a folder; a short commit when detached; null outside one. */
export function gitBranch(folder: string): string | null {
  let dir = resolve(folder)
  for (let i = 0; i < 64; i++) {
    const dotGit = join(dir, '.git')
    if (existsSync(dotGit)) {
      try {
        let gitDir = dotGit
        // A worktree or submodule: `.git` is a file naming the real one.
        if (statSync(dotGit).isFile()) {
          const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))
          if (!m) return null
          gitDir = isAbsolute(m[1]!.trim()) ? m[1]!.trim() : resolve(dir, m[1]!.trim())
        }
        const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
        const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head)
        return ref ? ref[1]! : head.slice(0, 7)
      } catch {
        return null
      }
    }
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
  return null
}
