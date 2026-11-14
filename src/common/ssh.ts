/** SSH hosts from ~/.ssh/config, and what sftp says in batch mode, read into the panels' entries. */
import type { Entry } from './commander'

export interface SshHost {
  /** The name `ssh` takes: the Host alias. */
  alias: string
  hostname?: string
  user?: string
  port?: number
}

/**
 * The hosts a config names, in order, without patterns (`*`, `?`, `!`); the
 * files it includes, as written (resolved by the caller).
 */
export function parseSshConfig(text: string): { hosts: SshHost[]; includes: string[] } {
  const hosts: SshHost[] = []
  const includes: string[] = []
  let current: SshHost[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(\S+)\s*=?\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const value = m[2]!.trim().replace(/^"(.*)"$/, '$1')
    if (key === 'host') {
      current = value
        .split(/\s+/)
        .filter((a) => a && !/[*?!]/.test(a))
        .map((alias) => ({ alias }))
      hosts.push(...current)
    } else if (key === 'match') current = []
    else if (key === 'include') includes.push(...value.split(/\s+/).filter(Boolean))
    else if (key === 'hostname') for (const h of current) h.hostname = value
    else if (key === 'user') for (const h of current) h.user = value
    else if (key === 'port') for (const h of current) h.port = Number(value) || undefined
  }
  const seen = new Set<string>()
  return { hosts: hosts.filter((h) => !seen.has(h.alias) && seen.add(h.alias)), includes }
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/**
 * `ls -la` in sftp's batch mode: the server's long lines
 * (`drwxr-xr-x  2 me staff 4096 Nov 14 10:00 name with spaces`), the echoed
 * commands (`sftp> …`) and `.`/`..` left out.
 */
export function parseSftpList(output: string, now = new Date()): Entry[] {
  const out: Entry[] = []
  for (const line of output.split(/\r?\n/)) {
    if (!line || line.startsWith('sftp>')) continue
    const m = /^([dlcbps-])[rwxsStT-]{9}[.+@]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+(\d{1,2}:\d{2}|\d{4})\s+(.+)$/.exec(line)
    if (!m) continue
    let name = m[6]!
    if (m[1] === 'l') name = name.replace(/ -> .*$/, '')
    name = name.split('/').pop() || name
    if (name === '.' || name === '..') continue
    const month = MONTHS[m[3]!.toLowerCase()] ?? 0
    const day = Number(m[4])
    let mtime: number
    if (m[5]!.includes(':')) {
      const [h, min] = m[5]!.split(':').map(Number)
      const d = new Date(now.getFullYear(), month, day, h, min)
      // A date in the future is last year's (ls shows the time for the last six months).
      if (d.getTime() > now.getTime() + 86_400_000) d.setFullYear(now.getFullYear() - 1)
      mtime = d.getTime()
    } else mtime = new Date(Number(m[5]), month, day).getTime()
    out.push({ name, kind: m[1] === 'd' ? 'dir' : m[1] === 'l' ? 'link' : m[1] === '-' ? 'file' : 'other', size: Number(m[2]), mtime, hidden: name.startsWith('.') })
  }
  return out
}

/** A path for an sftp batch line: in double quotes, quotes and backslashes escaped. */
export function sftpQuote(path: string): string {
  return `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** A remote place in a panel: `sftp://alias/path`. */
export function remoteDir(alias: string, path: string): string {
  return `sftp://${alias}${path.startsWith('/') ? path : '/' + path}`
}

export function parseRemote(dir: string): { alias: string; path: string } | null {
  const m = /^sftp:\/\/([^/]+)(\/.*)?$/.exec(dir)
  return m ? { alias: m[1]!, path: m[2] || '/' } : null
}
