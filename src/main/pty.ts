/**
 * Shells in pseudo-terminals, one per pane. What a shell writes is gathered
 * for a few milliseconds and sent to the window in one message (a `cat` of a
 * big file is thousands of pieces), and its last part is kept per pane, so a
 * pane shows its output again after a restart.
 */
import { chmodSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IPty } from 'node-pty'
import { EventReader, integrate, type ShellEvent } from '@dskripchenko/shell-integration'

// The main process is bundled as CommonJS; the tests' runner gives __filename too.
const require = createRequire(__filename)

/** The last `limit` characters written, kept cheaply: pieces dropped from the front as a whole. */
export class Tail {
  private parts: string[] = []
  private size = 0

  constructor(private limit: number) {}

  push(data: string): void {
    if (this.limit <= 0) return
    this.parts.push(data)
    this.size += data.length
    while (this.size - this.parts[0]!.length >= this.limit) this.size -= this.parts.shift()!.length
  }

  setLimit(limit: number): void {
    this.limit = limit
    if (limit <= 0) this.clear()
  }

  clear(): void {
    this.parts = []
    this.size = 0
  }

  /** The text kept, cut at the limit — after a line break, so no row starts in its middle. */
  text(): string {
    const all = this.parts.join('')
    if (all.length <= this.limit) return all
    const cut = all.slice(all.length - this.limit)
    const nl = cut.indexOf('\n')
    return nl >= 0 ? cut.slice(nl + 1) : cut
  }
}

/** The shell people use: theirs on macOS and Linux, PowerShell on Windows. */
export function shellOf(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, exists: (path: string) => boolean = existsSync): { file: string; args: string[] } {
  if (platform === 'win32') return { file: env.COMSPEC && /pwsh|powershell/i.test(env.COMSPEC) ? env.COMSPEC : 'powershell.exe', args: ['-NoLogo'] }
  const file = env.SHELL && exists(env.SHELL) ? env.SHELL : platform === 'darwin' && exists('/bin/zsh') ? '/bin/zsh' : '/bin/bash'
  // A login shell, as a terminal opens one: the profile's PATH and settings.
  return { file, args: /(?:ba|z|fi|k)sh$/.test(file) ? ['-l'] : [] }
}

/**
 * The environment a shell starts with: the user's, without what started shell
 * itself put there — Electron's variables, and npm's or pnpm's when it runs
 * from `pnpm start` — and with what a terminal says about itself.
 */
export function shellEnv(from: NodeJS.ProcessEnv, version: string, platform: NodeJS.Platform = process.platform): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(from)) {
    if (v === undefined || /^(ELECTRON_|npm_|NPM_|PNPM_|pnpm_|VSCODE_)/.test(k) || ['INIT_CWD', 'NODE', 'NODE_OPTIONS', 'NODE_PATH', 'SHELL_DATA'].includes(k)) continue
    env[k] = v
  }
  const path = env.PATH ?? env.Path
  if (path) {
    const sep = platform === 'win32' ? ';' : ':'
    const kept = path.split(sep).filter((d) => !/[\\/]node_modules[\\/]\.bin$|[\\/]node-gyp-bin$/.test(d))
    if (env.PATH) env.PATH = kept.join(sep)
    else env.Path = kept.join(sep)
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'shell'
  env.TERM_PROGRAM_VERSION = version
  if (!env.LANG && platform !== 'win32') env.LANG = 'en_US.UTF-8'
  return env
}

/** node-pty's helper on macOS comes out of the package without the right to run (pnpm drops it). */
function fixSpawnHelper(): void {
  if (process.platform !== 'darwin') return
  try {
    const root = dirname(require.resolve('node-pty/package.json'))
    for (const dir of [join(root, 'prebuilds', `darwin-${process.arch}`), join(root, 'build', 'Release')]) {
      const helper = join(dir, 'spawn-helper').replace('app.asar', 'app.asar.unpacked')
      if (existsSync(helper) && (statSync(helper).mode & 0o111) === 0) chmodSync(helper, 0o755)
    }
  } catch {
    // Not where expected: spawning says so.
  }
}

export interface PtySink {
  data(paneId: string, data: string): void
  exit(paneId: string, code: number): void
  /** What the shell's output says besides its text: marks, its folder, a notification, a bell. */
  events(paneId: string, events: ShellEvent[]): void
}

interface Session {
  pty: IPty
  pending: string
  timer: NodeJS.Timeout | null
}

export interface ShellChoice {
  program: string
  args: string[]
  /** Variables of a profile, over the user's environment. */
  env?: Record<string, string>
}

export class Ptys {
  private readonly sessions = new Map<string, Session>()
  private readonly tails = new Map<string, Tail>()
  private helperFixed = false

  constructor(
    private readonly sink: PtySink,
    private readonly version: string,
    private tailLimit: number,
    /** Where the shell integration's scripts are written. */
    private readonly scripts: string,
  ) {}

  /** Output kept from before, put back as the pane's tail (it is saved again with what comes next). */
  seed(paneId: string, text: string): void {
    const tail = new Tail(this.tailLimit)
    tail.push(text)
    this.tails.set(paneId, tail)
  }

  setTailLimit(limit: number): void {
    this.tailLimit = limit
    for (const t of this.tails.values()) t.setLimit(limit)
  }

  spawn(paneId: string, opts: { cwd?: string; cols: number; rows: number; shell: ShellChoice }): { ok: true; pid: number } | { ok: false; error: string } {
    this.kill(paneId)
    if (!this.helperFixed) {
      fixSpawnHelper()
      this.helperFixed = true
    }
    const base = opts.shell.program ? { file: opts.shell.program, args: opts.shell.args } : shellOf()
    const env = { ...shellEnv(process.env, this.version), ...(opts.shell.env ?? {}) }
    // The integration's marks and folder, where shell has a script for the shell.
    const launch = integrate(base.file, base.args, this.scripts, env)
    const shell = { file: base.file, args: launch?.args ?? base.args }
    const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir()
    let pty: IPty
    try {
      const { spawn } = require('node-pty') as typeof import('node-pty')
      pty = spawn(shell.file, shell.args, { name: 'xterm-256color', cols: Math.max(2, opts.cols), rows: Math.max(1, opts.rows), cwd, env: { ...env, ...(launch?.env ?? {}) } })
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    const session: Session = { pty, pending: '', timer: null }
    this.sessions.set(paneId, session)
    if (!this.tails.has(paneId)) this.tails.set(paneId, new Tail(this.tailLimit))
    const tail = this.tails.get(paneId)!
    const reader = new EventReader()
    const flush = () => {
      session.timer = null
      if (session.pending) {
        this.sink.data(paneId, session.pending)
        session.pending = ''
      }
    }
    pty.onData((data) => {
      tail.push(data)
      const events = reader.read(data)
      if (events.length) this.sink.events(paneId, events)
      session.pending += data
      // A lot at once goes out at once; a little waits a moment for the rest.
      if (session.pending.length > 256 * 1024) flush()
      else session.timer ??= setTimeout(flush, 4)
    })
    pty.onExit(({ exitCode }) => {
      if (session.timer) clearTimeout(session.timer)
      flush()
      if (this.sessions.get(paneId) === session) this.sessions.delete(paneId)
      this.sink.exit(paneId, exitCode)
    })
    return { ok: true, pid: pty.pid }
  }

  pid(paneId: string): number | null {
    return this.sessions.get(paneId)?.pty.pid ?? null
  }

  write(paneId: string, data: string): void {
    this.sessions.get(paneId)?.pty.write(data)
  }

  resize(paneId: string, cols: number, rows: number): void {
    try {
      this.sessions.get(paneId)?.pty.resize(Math.max(2, cols), Math.max(1, rows))
    } catch {
      // The shell has just ended.
    }
  }

  /** The pane closed: its shell ended and its output forgotten. */
  kill(paneId: string): void {
    const s = this.sessions.get(paneId)
    if (s) {
      this.sessions.delete(paneId)
      if (s.timer) clearTimeout(s.timer)
      try {
        s.pty.kill()
      } catch {
        // Already gone.
      }
    }
  }

  forget(paneId: string): void {
    this.kill(paneId)
    this.tails.delete(paneId)
  }

  /** Each pane's last output, for the next start. */
  tailsText(): Map<string, string> {
    return new Map([...this.tails].map(([id, t]) => [id, t.text()]))
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}
