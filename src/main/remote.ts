/**
 * Remote hosts by the system's own OpenSSH: the hosts of ~/.ssh/config (its
 * Includes followed), and their files by `sftp` in batch mode — keys and the
 * ssh-agent only, the host's key checked by OpenSSH as in any terminal. A
 * host that wants a password, or whose key is not known yet, is opened once in
 * a terminal tab first. Nothing secret is kept by shell.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, posix } from 'node:path'
import type { Entry } from '../common/commander'
import { parseSftpList, parseSshConfig, sftpQuote, type SshHost } from '../common/ssh'
import type { OpResult } from './files'
import { msg } from '../common/i18n'

/** The hosts of ~/.ssh/config, its Includes (globs of one level) read in place. */
export function sshHosts(home = homedir()): SshHost[] {
  const seen = new Set<string>()
  const hosts: SshHost[] = []
  const read = (file: string, depth: number) => {
    if (depth > 5 || seen.has(file) || !existsSync(file)) return
    seen.add(file)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return
    }
    const parsed = parseSshConfig(text)
    for (const h of parsed.hosts) if (!hosts.some((x) => x.alias === h.alias)) hosts.push(h)
    for (const inc of parsed.includes) {
      const path = inc.startsWith('~') ? join(home, inc.slice(1)) : isAbsolute(inc) ? inc : join(home, '.ssh', inc)
      if (!/[*?]/.test(basename(path))) read(path, depth + 1)
      else {
        const re = new RegExp('^' + basename(path).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
        try {
          for (const name of readdirSync(dirname(path)).sort()) if (re.test(name)) read(join(dirname(path), name), depth + 1)
        } catch {
          // No such folder.
        }
      }
    }
  }
  read(join(home, '.ssh', 'config'), 0)
  return hosts
}

const ALIAS = /^[\w.@-]{1,253}$/

/** One sftp session in batch mode; what it said, and why it failed. */
function sftp(alias: string, script: string, cwd?: string): Promise<{ out: string; error: string | null }> {
  if (!ALIAS.test(alias)) return Promise.resolve({ out: '', error: msg().main.notHostName })
  return new Promise((done) => {
    const p = spawn('sftp', ['-q', '-b', '-', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', alias], { cwd, windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill(), 120_000)
    p.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')))
    p.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')))
    p.on('error', (e) => {
      clearTimeout(timer)
      done({ out, error: /ENOENT/.test(e.message) ? msg().main.noSftp : e.message })
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return done({ out, error: null })
      const first = err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? msg().main.sftpEnded(code)
      const hint = /Permission denied|Host key verification failed|password/i.test(err) ? msg().main.sftpHint : ''
      done({ out, error: first + hint })
    })
    p.stdin.end(script + '\n')
  })
}

export async function remoteHome(alias: string): Promise<{ path: string } | { error: string }> {
  const r = await sftp(alias, 'pwd')
  if (r.error) return { error: r.error }
  const m = /Remote working directory:\s*(.+)/.exec(r.out)
  return { path: m ? m[1]!.trim() : '/' }
}

export async function remoteList(alias: string, path: string): Promise<Entry[] | { error: string }> {
  const r = await sftp(alias, `ls -la ${sftpQuote(path)}`)
  return r.error ? { error: r.error } : parseSftpList(r.out)
}

async function each(items: string[], one: (item: string) => Promise<string | null>): Promise<OpResult> {
  const r: OpResult = { done: [], failed: [] }
  for (const item of items) {
    const error = await one(item)
    if (error) r.failed.push({ path: item, error })
    else r.done.push(item)
  }
  return r
}

/** Remote files and folders into a local folder. */
export function remoteGet(alias: string, items: string[], localDir: string): Promise<OpResult> {
  return each(items, async (item) => (await sftp(alias, `get -R ${sftpQuote(item)} ${sftpQuote(localDir + '/')}`)).error)
}

/** Local files and folders into a remote folder. */
export function remotePut(alias: string, items: string[], remoteDir: string): Promise<OpResult> {
  return each(items, async (item) => (await sftp(alias, `put -R ${sftpQuote(item)} ${sftpQuote(remoteDir.replace(/\/?$/, '/'))}`)).error)
}

export async function remoteMkdir(alias: string, path: string): Promise<string | null> {
  return (await sftp(alias, `mkdir ${sftpQuote(path)}`)).error
}

export async function remoteRename(alias: string, from: string, to: string): Promise<string | null> {
  return (await sftp(alias, `rename ${sftpQuote(from)} ${sftpQuote(to)}`)).error
}

/** Deleted for good (there is no trash over sftp); a folder only when empty. */
export function remoteRemove(alias: string, items: { path: string; dir: boolean }[]): Promise<OpResult> {
  return each(
    items.map((i) => `${i.dir ? 'd' : 'f'}:${i.path}`),
    async (tagged) => {
      const dir = tagged.startsWith('d:')
      const path = tagged.slice(2)
      const r = await sftp(alias, `${dir ? 'rmdir' : 'rm'} ${sftpQuote(path)}`)
      return r.error ? (dir ? msg().main.folderOnlyEmpty(r.error) : r.error) : null
    },
  ).then((r) => ({ done: r.done.map((x) => x.slice(2)), failed: r.failed.map((f) => ({ ...f, path: f.path.slice(2) })) }))
}

/** A remote file brought into a folder of its own in the temporary one, for the quick view and the viewer. */
export async function remoteFetch(alias: string, path: string): Promise<{ local: string } | { error: string }> {
  const dir = join(tmpdir(), 'shell-remote', randomBytes(6).toString('hex'))
  mkdirSync(dir, { recursive: true })
  const r = await sftp(alias, `get ${sftpQuote(path)} ${sftpQuote(dir + '/')}`)
  return r.error ? { error: r.error } : { local: join(dir, posix.basename(path)) }
}
