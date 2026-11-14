/**
 * folio (https://github.com/dskripchenko/folio), when it is on the machine:
 * found, and handed a file at a line, a folder as a project, a repository's
 * review. folio is started with arguments; a running folio takes them over
 * (one instance), so the same call serves both.
 *
 * Where it is looked for: the config's `[folio] path`; the presence file a
 * running folio leaves (`folio-presence.json` in the user's runtime or
 * temporary folder); `folio` in PATH; the usual places of a portable app
 * (/Applications and ~/Applications on a Mac, beside shell everywhere).
 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'

import type { FolioRequest } from '../common/ipc'


export interface Folio {
  /** The command that starts folio; the arguments go after it. */
  launch: string[]
  /** Found as a running folio. */
  running: boolean
}

interface Presence {
  pid: number
  launch: string[]
  capabilities?: string[]
}

export interface FindInput {
  configured: string
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  /** shell's own program: folio is looked for beside it. */
  execPath: string
  home?: string
  tmp?: string
  /** The user's id, to trust only a presence file of theirs (not on Windows). */
  uid?: number
  isFile?: (path: string) => boolean
  read?: (path: string) => string
  owner?: (path: string) => number | null
  list?: (dir: string) => string[]
  alive?: (pid: number) => boolean
}

const isFileDefault = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
const ownerDefault = (path: string): number | null => {
  try {
    return statSync(path).uid
  } catch {
    return null
  }
}
const listDefault = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
const aliveDefault = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // Alive, only not ours to signal.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The program inside a Mac bundle, the bundle given. */
function programOf(path: string, platform: NodeJS.Platform): string {
  return platform === 'darwin' && /\.app\/?$/.test(path) ? join(path, 'Contents', 'MacOS', 'folio') : path
}

/** Where a running folio says it is (its own file, of this user, of a live process). */
export function presenceOf(input: FindInput): Folio | null {
  const read = input.read ?? ((p: string) => readFileSync(p, 'utf8'))
  const path = input.env.FOLIO_PRESENCE || join(input.env.XDG_RUNTIME_DIR || (input.tmp ?? tmpdir()), 'folio-presence.json')
  if (input.platform !== 'win32' && input.uid !== undefined && (input.owner ?? ownerDefault)(path) !== input.uid) return null
  try {
    const p = JSON.parse(read(path)) as Presence
    if (!Number.isInteger(p.pid) || !Array.isArray(p.launch) || p.launch.length === 0 || !p.launch.every((a) => typeof a === 'string')) return null
    if (!(input.alive ?? aliveDefault)(p.pid)) return null
    if (!(input.isFile ?? isFileDefault)(p.launch[0]!)) return null
    return { launch: p.launch, running: true }
  } catch {
    return null
  }
}

/** folio's program, or null when it is not on the machine. */
export function findFolio(input: FindInput): Folio | null {
  const isFile = input.isFile ?? isFileDefault
  const { platform } = input
  const exe = platform === 'win32' ? 'folio.exe' : 'folio'
  if (input.configured) {
    const program = programOf(input.configured, platform)
    return isAbsolute(program) && isFile(program) ? { launch: [program], running: false } : null
  }
  const running = presenceOf(input)
  if (running) return running
  const candidates: string[] = []
  for (const dir of (input.env.PATH ?? input.env.Path ?? '').split(delimiter)) if (dir && isAbsolute(dir)) candidates.push(join(dir, exe))
  const home = input.home ?? homedir()
  // Beside shell: shell.app's folder on a Mac, the program's folder elsewhere, and the folder above it.
  const bundle = /^(.*)\/[^/]+\.app\/Contents\/MacOS\/[^/]+$/.exec(input.execPath)?.[1]
  const beside = bundle ?? dirname(input.execPath)
  if (platform === 'darwin') {
    for (const dir of ['/Applications', join(home, 'Applications'), beside]) candidates.push(join(dir, 'folio.app', 'Contents', 'MacOS', 'folio'))
  } else if (platform === 'win32') {
    candidates.push(join(beside, exe), join(dirname(beside), 'folio', exe))
  } else {
    // AppImages beside shell, the newest version last in name order.
    const images = (input.list ?? listDefault)(beside).filter((n) => /^folio.*\.AppImage$/.test(n)).sort()
    if (images.length) candidates.push(join(beside, images[images.length - 1]!))
    candidates.push(join(dirname(beside), 'folio', exe))
  }
  const found = candidates.find((c) => isFile(c))
  return found ? { launch: [found], running: false } : null
}

/** The arguments for a request, as folio reads its command line. */
export function folioArgs(request: FolioRequest): string[] {
  const args: string[] = []
  if (request.project) args.push('--project', request.project)
  if (request.review) args.push('--review', request.review)
  if (request.file) args.push(request.file.line ? `${request.file.path}:${request.file.line}` : request.file.path)
  return args
}

/** folio started with the request: a running one takes it over, a new one opens with it. */
export function launchFolio(folio: Folio, request: FolioRequest, env: NodeJS.ProcessEnv): Promise<{ ok: true } | { error: string }> {
  const [program, ...pre] = folio.launch
  // An Electron app started from an Electron app: what makes it run as Node is not passed on.
  const clean: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) if (!/^(ELECTRON_|SHELL_DATA$|SHELL_E2E$)/.test(k)) clean[k] = v
  return new Promise((resolve) => {
    try {
      const child = spawn(program!, [...pre, ...folioArgs(request)], { detached: true, stdio: 'ignore', env: clean, windowsHide: false })
      child.once('error', (e) => resolve({ error: e.message }))
      child.once('spawn', () => {
        child.unref()
        resolve({ ok: true })
      })
    } catch (e) {
      resolve({ error: e instanceof Error ? e.message : String(e) })
    }
  })
}

/** A request from the window, checked: absolute paths, a positive line. */
export function folioRequest(value: unknown): FolioRequest | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const path = (x: unknown): x is string => typeof x === 'string' && isAbsolute(x) && !x.startsWith('-')
  const out: FolioRequest = {}
  if (v.file !== undefined) {
    const f = v.file as Record<string, unknown> | null
    if (!f || !path(f.path)) return null
    if (f.line !== undefined && !(Number.isInteger(f.line) && (f.line as number) > 0)) return null
    out.file = f.line === undefined ? { path: f.path } : { path: f.path, line: f.line as number }
  }
  if (v.project !== undefined) {
    if (!path(v.project)) return null
    out.project = v.project
  }
  if (v.review !== undefined) {
    if (!path(v.review)) return null
    out.review = v.review
  }
  return out.file || out.project || out.review ? out : null
}
