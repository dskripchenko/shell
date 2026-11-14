/**
 * Agents tell their turns: a pane's programs call `shell-notify waiting|done|running [message]`
 * (an agent's hooks do it for it), which posts to a server of shell's own on
 * 127.0.0.1 with a token made at each start. The pane is named by
 * SHELL_PANE_ID, given to every pane's shell with the server's address.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readApiRequest, type ApiRequest } from './api'
import { join } from 'node:path'

export type SignalState = 'running' | 'waiting' | 'done'

export interface Signal {
  paneId: string
  state: SignalState
  agent?: string
  message?: string
}

/** A request's signal, or why it is refused. */
export function readSignal(url: string, auth: string | undefined, token: string): Signal | { error: number } {
  if (auth !== `Bearer ${token}`) return { error: 401 }
  let u: URL
  try {
    u = new URL(url, 'http://127.0.0.1')
  } catch {
    return { error: 400 }
  }
  if (u.pathname !== '/notify') return { error: 404 }
  const paneId = u.searchParams.get('pane') ?? ''
  const state = u.searchParams.get('state') ?? ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(paneId) || !['running', 'waiting', 'done'].includes(state)) return { error: 400 }
  const agent = u.searchParams.get('agent')?.slice(0, 40) || undefined
  const message = u.searchParams.get('message')?.slice(0, 500) || undefined
  return { paneId, state: state as SignalState, ...(agent ? { agent } : {}), ...(message ? { message } : {}) }
}

/** The command for POSIX shells and Git Bash: `shell-notify <state> [message] [--agent name]`. */
export const NOTIFY_SH = `#!/bin/sh
# shell-notify: tell shell what the agent in this pane is doing.
#   shell-notify waiting "Claude needs your permission"   shell-notify done   shell-notify running
# Outside shell (no SHELL_NOTIFY_URL) it does nothing.
[ -n "$SHELL_NOTIFY_URL" ] && [ -n "$SHELL_PANE_ID" ] || exit 0
state=$1; shift 2>/dev/null
agent=
if [ "$1" = "--agent" ]; then agent=$2; shift 2 2>/dev/null; fi
curl -s -m 2 -o /dev/null -X POST -H "Authorization: Bearer $SHELL_NOTIFY_TOKEN" \\
  --data-urlencode "pane=$SHELL_PANE_ID" --data-urlencode "state=$state" \\
  --data-urlencode "agent=$agent" --data-urlencode "message=$*" -G "$SHELL_NOTIFY_URL/notify" || true
`

/** The same for cmd and PowerShell on Windows (curl.exe comes with Windows 10 and later). */
export const NOTIFY_CMD = `@echo off
rem shell-notify: tell shell what the agent in this pane is doing.
if "%SHELL_NOTIFY_URL%"=="" exit /b 0
if "%SHELL_PANE_ID%"=="" exit /b 0
set "__state=%~1"
set "__message=%~2"
curl.exe -s -m 2 -o NUL -X POST -H "Authorization: Bearer %SHELL_NOTIFY_TOKEN%" --data-urlencode "pane=%SHELL_PANE_ID%" --data-urlencode "state=%__state%" --data-urlencode "message=%__message%" -G "%SHELL_NOTIFY_URL%/notify"
exit /b 0
`

export class NotifyServer {
  readonly token = randomBytes(24).toString('hex')
  private server: Server | null = null
  url = ''

  constructor(
    /** Where the commands are written (put first in every pane's PATH). */
    readonly binDir: string,
    private readonly onSignal: (s: Signal) => boolean,
  ) {}

  async start(): Promise<void> {
    mkdirSync(this.binDir, { recursive: true })
    writeFileSync(join(this.binDir, 'shell-notify'), NOTIFY_SH)
    chmodSync(join(this.binDir, 'shell-notify'), 0o755)
    writeFileSync(join(this.binDir, 'shell-notify.cmd'), NOTIFY_CMD.replace(/\n/g, '\r\n'))
    this.server = createServer((req, res) => {
      if ((req.url ?? '').startsWith('/api/')) return void this.serveApi(req, res)
      const s = readSignal(req.url ?? '', req.headers.authorization, this.token)
      if ('error' in s) {
        res.writeHead(s.error).end()
        return
      }
      res.writeHead(this.onSignal(s) ? 204 : 404).end()
    })
    await new Promise<void>((done) => this.server!.listen(0, '127.0.0.1', done))
    const address = this.server.address()
    this.url = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : ''
  }

  /** Other programs' requests (api.ts), under the API's own token. */
  api: { token: string; handle: (r: ApiRequest) => Promise<{ status: number; body?: object }> } | null = null

  private serveApi(req: IncomingMessage, res: ServerResponse): void {
    const api = this.api
    if (!api) return void res.writeHead(404).end()
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 64 * 1024) {
        res.writeHead(413).end()
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (res.headersSent) return
      const r = readApiRequest(req.method ?? '', req.url ?? '', req.headers.authorization, api.token, Buffer.concat(chunks).toString('utf8'))
      if ('error' in r) return void res.writeHead(r.error).end()
      api.handle(r).then(
        ({ status, body }) => {
          if (body) res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
          else res.writeHead(status).end()
        },
        () => res.writeHead(500).end(),
      )
    })
  }

  /** What every pane's shell is given. */
  env(paneId: string, path: string | undefined, platform: NodeJS.Platform): Record<string, string> {
    const sep = platform === 'win32' ? ';' : ':'
    return {
      SHELL_PANE_ID: paneId,
      SHELL_NOTIFY_URL: this.url,
      SHELL_NOTIFY_TOKEN: this.token,
      PATH: path ? `${this.binDir}${sep}${path}` : this.binDir,
    }
  }

  close(): void {
    this.server?.close()
  }
}
