/**
 * shell's local API for other programs of the user (folio): a tab opened in a
 * folder, a text pasted into the agent's pane of a repository (without Enter:
 * the person sends it), a review waiting for an agent shown on its tabs.
 *
 * On the same local server as the agents' signals, under its own token: the
 * panes' token (in every pane's environment) does not open it, so a program in
 * a pane cannot type into another pane. The token and the address are in the
 * presence file (`shell-presence.json`, the user's only), removed on exit.
 */
import { randomBytes } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

export const API_CAPABILITIES = ['open-tab', 'paste', 'review'] as const

export type ApiRequest =
  | { kind: 'open-tab'; cwd: string; name?: string }
  | { kind: 'paste'; repo: string; text: string }
  | { kind: 'review'; repo: string; state: 'waiting' | 'none'; message?: string }

const MAX_TEXT = 32 * 1024

/** Control characters other than tab and newline out: a text cannot press keys of its own. */
export function cleanText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
}

/** A request's body read, or why it is refused. */
export function readApiRequest(method: string, url: string, auth: string | undefined, token: string, body: string): ApiRequest | { error: number } {
  if (auth !== `Bearer ${token}`) return { error: 401 }
  if (method !== 'POST') return { error: 405 }
  const path = url.split('?')[0]
  let v: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object') return { error: 400 }
    v = parsed as Record<string, unknown>
  } catch {
    return { error: 400 }
  }
  const dir = (x: unknown): x is string => typeof x === 'string' && isAbsolute(x) && x.length < 4096
  switch (path) {
    case '/api/open-tab':
      if (!dir(v.cwd)) return { error: 400 }
      return { kind: 'open-tab', cwd: v.cwd, ...(typeof v.name === 'string' && v.name.trim() ? { name: v.name.trim().slice(0, 60) } : {}) }
    case '/api/paste':
      if (!dir(v.repo) || typeof v.text !== 'string' || !v.text.trim() || v.text.length > MAX_TEXT) return { error: 400 }
      return { kind: 'paste', repo: v.repo, text: cleanText(v.text) }
    case '/api/review':
      if (!dir(v.repo) || (v.state !== 'waiting' && v.state !== 'none')) return { error: 400 }
      return { kind: 'review', repo: v.repo, state: v.state, ...(typeof v.message === 'string' && v.message ? { message: v.message.slice(0, 300) } : {}) }
    default:
      return { error: 404 }
  }
}

export function apiToken(): string {
  return randomBytes(24).toString('hex')
}

export function presencePath(env: NodeJS.ProcessEnv, tmp: string = tmpdir()): string {
  return env.SHELL_PRESENCE || join(env.XDG_RUNTIME_DIR || tmp, 'shell-presence.json')
}

export function writePresence(path: string, presence: { pid: number; version: string; url: string; token: string }): void {
  try {
    writeFileSync(path, JSON.stringify({ ...presence, capabilities: API_CAPABILITIES }, null, 2), { mode: 0o600 })
  } catch {
    // Not found by other programs: shell works the same.
  }
}

export function removePresence(path: string, pid: number, read: (path: string) => string): void {
  try {
    if ((JSON.parse(read(path)) as { pid?: number }).pid === pid) rmSync(path, { force: true })
  } catch {
    // Gone already.
  }
}
