/**
 * Shells in pseudo-terminals, one per pane. What a shell writes is gathered
 * for a few milliseconds and sent to the window in one message (a `cat` of a
 * big file is thousands of pieces), and its screen is kept per pane, so a
 * pane shows its output again after a restart.
 */
import { chmodSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IPty } from 'node-pty'
import { EventReader, integrate, type ShellEvent } from '@dskripchenko/shell-integration'
import { Terminal } from '@dskripchenko/terminal'
import { snapshot } from '../common/snapshot'

// The main process is bundled as CommonJS; the tests' runner gives __filename too.
const require = createRequire(__filename)

/**
 * A pane's screen as its output draws it, kept in the main process — the
 * window's own terminal may be gone when it closes — to be saved and shown
 * again after a restart (see `snapshot`). The raw output is not saved: cut at
 * any point, it begins inside a program's redraw, and modes it turns on (the
 * mouse, focus events) would come back with it.
 */
export class Tail {
  private term: Terminal | null = null
  /** The last snapshot, until something changes: a pane left alone is not read again at each save. */
  private cached: string | null = null

  constructor(
    private limit: number,
    private cols = 120,
    private rows = 40,
  ) {}

  /** Rows kept above the screen: about what fits in the limit, a hundred characters a line. */
  private scrollback(): number {
    return Math.min(10_000, Math.max(200, Math.ceil(this.limit / 100)))
  }

  push(data: string): void {
    if (this.limit <= 0) return
    this.term ??= new Terminal({ cols: this.cols, rows: this.rows, scrollback: this.scrollback() })
    this.term.write(data)
    this.cached = null
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    if (this.term && (this.term.cols !== cols || this.term.rows !== rows)) {
      this.term.resize(cols, rows)
      this.cached = null
    }
  }

  setLimit(limit: number): void {
    const was = this.scrollback()
    this.limit = limit
    this.cached = null
    if (limit <= 0) this.clear()
    else if (this.term && this.scrollback() !== was) {
      // The scrollback's size is the terminal's from the start: what there is goes to a new one.
      const text = this.text()
      this.term = null
      this.push(text)
    }
  }

  clear(): void {
    this.term = null
    this.cached = null
  }

  /** What there is to show again: the lines with their colours, within the limit. */
  text(): string {
    return (this.cached ??= this.term ? snapshot(this.term, this.limit) : '')
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
    /** What every pane's shell is given to reach shell (shell-notify). */
    private readonly paneEnv: (paneId: string, path: string | undefined) => Record<string, string> = () => ({}),
  ) {}

  has(paneId: string): boolean {
    return this.sessions.has(paneId)
  }

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
    const own = { ...shellEnv(process.env, this.version), ...(opts.shell.env ?? {}) }
    // PATH under the name the environment already has it (Windows often says Path).
    const { PATH: panePath, ...paneVars } = this.paneEnv(paneId, own.PATH ?? own.Path)
    const pathKey = own.PATH === undefined && own.Path !== undefined ? 'Path' : 'PATH'
    const env: Record<string, string> = { ...own, ...paneVars, ...(panePath !== undefined ? { [pathKey]: panePath } : {}) }
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
    tail.resize(Math.max(2, opts.cols), Math.max(1, opts.rows))
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
      session.pending += data
      if (events.length) {
        // The output first, then what its marks say: the window sees a prompt after what came before it.
        if (session.timer) clearTimeout(session.timer)
        flush()
        this.sink.events(paneId, events)
        return
      }
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
    const session = this.sessions.get(paneId)
    if (!session) return
    try {
      const size = [Math.max(2, cols), Math.max(1, rows)] as const
      session.pty.resize(...size)
      // The size asked for: on Windows node-pty applies it later, its cols and rows are still the old ones.
      this.tails.get(paneId)?.resize(...size)
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
