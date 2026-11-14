/**
 * What an agent changed in its repository: a baseline taken when it starts
 * (the working tree as a commit object, made by `git stash create` without
 * touching anything, and the untracked files then), and against it the files
 * changed since, with their diffs. Runs the system's git, in the repository's
 * folder, with arguments as a list.
 */
import { execFile } from 'node:child_process'
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { compactEdits, JOURNAL, readEdits } from '@dskripchenko/shell-integration'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { msg } from '../common/i18n'

export interface Baseline {
  root: string
  /** A commit (HEAD, or the working tree's state then); null in a repository with no commit yet. */
  base: string | null
  /** Untracked files when it was taken: not counted as the agent's. */
  untracked: string[]
}

export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
  adds: number
  dels: number
  /** A new file git does not track yet: its diff is its whole text. */
  untracked?: boolean
}

function git(cwd: string, args: string[], maxBuffer = 16 * 1024 * 1024): Promise<string> {
  return new Promise((done, fail) => {
    execFile('git', ['-c', 'core.quotepath=off', ...args], { cwd, maxBuffer, windowsHide: true, timeout: 20_000 }, (err, stdout) => (err ? fail(err) : done(stdout)))
  })
}

export async function repoRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim() || null
  } catch {
    return null
  }
}

async function untrackedFiles(root: string): Promise<string[]> {
  const out = await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  return out.split('\0').filter(Boolean)
}

export async function takeBaseline(cwd: string): Promise<Baseline | null> {
  const root = await repoRoot(cwd)
  if (!root) return null
  let base: string | null
  try {
    base = (await git(root, ['stash', 'create'])).trim() || (await git(root, ['rev-parse', 'HEAD'])).trim()
  } catch {
    base = null
  }
  return { root, base, untracked: await untrackedFiles(root) }
}

/** HEAD as the baseline: the working copy's changes, when no agent started one. */
export async function headBaseline(cwd: string): Promise<Baseline | null> {
  const root = await repoRoot(cwd)
  if (!root) return null
  let base: string | null
  try {
    base = (await git(root, ['rev-parse', 'HEAD'])).trim()
  } catch {
    base = null
  }
  return { root, base, untracked: [] }
}

export async function changedFiles(b: Baseline): Promise<ChangedFile[]> {
  const files = new Map<string, ChangedFile>()
  if (b.base) {
    const numstat = await git(b.root, ['diff', '--numstat', '-z', '--no-renames', b.base])
    const status = await git(b.root, ['diff', '--name-status', '-z', '--no-renames', b.base])
    const kinds = new Map<string, string>()
    const st = status.split('\0').filter(Boolean)
    for (let i = 0; i + 1 < st.length; i += 2) kinds.set(st[i + 1]!, st[i]!)
    for (const rec of numstat.split('\0').filter(Boolean)) {
      const [a, d, path] = rec.split('\t')
      if (!path) continue
      const k = kinds.get(path)
      files.set(path, { path, status: k === 'A' ? 'added' : k === 'D' ? 'deleted' : 'modified', adds: Number(a) || 0, dels: Number(d) || 0 })
    }
  }
  const before = new Set(b.untracked)
  for (const path of await untrackedFiles(b.root)) {
    if (before.has(path) || files.has(path)) continue
    let adds: number
    try {
      const text = await readFile(resolve(b.root, path), 'utf8')
      adds = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    } catch {
      adds = 0
    }
    files.set(path, { path, status: 'added', adds, dels: 0, untracked: true })
  }
  return [...files.values()].sort((x, y) => x.path.localeCompare(y.path))
}

/** A path inside the repository, or null for one that leaves it. */
export function inside(root: string, path: string): string | null {
  if (isAbsolute(path)) return null
  const full = resolve(root, normalize(path))
  const rel = relative(root, full)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..') ? full : null
}

/** A file's diff against the baseline (unified, 3 lines of context); an untracked file's whole text. */
export async function fileDiff(b: Baseline, path: string, untracked: boolean): Promise<{ diff: string } | { text: string } | { error: string }> {
  const full = inside(b.root, path)
  if (!full) return { error: msg().main.outsideRepo }
  if (untracked || !b.base) {
    try {
      const text = await readFile(full, 'utf8')
      return text.includes('\0') ? { error: msg().main.binaryFile } : { text }
    } catch {
      return { error: msg().main.notRead }
    }
  }
  return { diff: await git(b.root, ['diff', '--no-renames', '--no-color', b.base, '--', path]) }
}

/** An agent's edit of a file of the repository (the shared journal, `.git/agent-edits.jsonl`). */
export interface RepoEdit {
  /** From the repository's root, `/`-separated. */
  path: string
  pane: string
  session: string
  tool: string
  time: number
}

const realOr = (p: string): string => {
  try {
    return realpathSync.native(p)
  } catch {
    return p
  }
}

/**
 * The agents' edits in a repository, newest last, from the journal its hook
 * keeps (see `editsHookCommand`); the journal written again small when it has grown.
 */
export async function repoEdits(root: string): Promise<RepoEdit[]> {
  let gitDir: string
  try {
    gitDir = resolve(root, (await git(root, ['rev-parse', '--git-common-dir'])).trim())
  } catch {
    return []
  }
  const file = join(gitDir, JOURNAL)
  let text: string
  try {
    if (statSync(file).size > 64 << 20) return []
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const edits = readEdits(text)
  if (text.length > 4 << 20) {
    try {
      writeFileSync(file, compactEdits(edits.slice(-20_000)))
    } catch {
      // Read again next time.
    }
  }
  const base = realOr(root)
  const out: RepoEdit[] = []
  for (const e of edits.slice(-5000)) {
    const full = realOr(isAbsolute(e.path) ? e.path : resolve(e.cwd || root, e.path))
    const rel = relative(base, full)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
    out.push({ path: rel.split(sep).join('/'), pane: e.pane, session: e.session, tool: e.tool, time: e.time })
  }
  return out
}
