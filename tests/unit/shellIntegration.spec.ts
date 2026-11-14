import { chmodSync, existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Terminal } from '@dskripchenko/terminal'
import { spawn } from 'node-pty'
import { EventReader, integrate, shellKind, type ShellEvent } from '@dskripchenko/shell-integration'
import { shellEnv } from '../../src/main/pty'

const require = createRequire(import.meta.url)
// node-pty's helper needs the right to run on macOS (as the app gives it).
if (process.platform === 'darwin') {
  const helper = join(dirname(require.resolve('node-pty/package.json')), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper')
  if (existsSync(helper) && (statSync(helper).mode & 0o111) === 0) chmodSync(helper, 0o755)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A real shell with the marks: commands typed, the screen and the events read back. */
async function run(shell: string, args: string[], lines: string[], extraEnv: Record<string, string> = {}): Promise<{ term: Terminal; events: ShellEvent[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'shell-marks-'))
  const env = { ...shellEnv(process.env, 'test'), ...extraEnv }
  const launch = integrate(shell, args, dir, env)!
  expect(launch).not.toBeNull()
  const term = new Terminal({ cols: 100, rows: 30 })
  const reader = new EventReader()
  const events: ShellEvent[] = []
  const p = spawn(shell, launch.args, { name: 'xterm-256color', cols: 100, rows: 30, cwd: tmpdir(), env: { ...env, ...launch.env } })
  p.onData((d) => {
    term.write(d)
    events.push(...reader.read(d))
  })
  term.onData((d) => p.write(d))
  for (let i = 0; i < 300 && term.commands.length === 0; i++) await wait(100)
  const ended = () => term.commands.filter((c) => c.end !== undefined).length
  for (const line of lines) {
    const before = ended()
    p.write(line + '\r')
    for (let i = 0; i < 300 && (ended() <= before || term.commands.length <= before + 1); i++) await wait(100)
  }
  await wait(300)
  p.kill()
  return { term, events }
}

const shells: [string, string, string[]][] = [
  ['zsh', '/bin/zsh', ['-l']],
  ['bash', '/bin/bash', ['-l']],
  ['powershell', 'powershell.exe', ['-NoLogo']],
]

describe('shell integration on real shells', () => {
  for (const [name, path, args] of shells) {
    const present = name === 'powershell' ? process.platform === 'win32' : process.platform !== 'win32' && existsSync(path)
    it.skipIf(!present)(`${name}: commands marked with their text and exit code; the folder said`, async () => {
      const target = mkdtempSync(join(tmpdir(), 'shell-cd-'))
      const fail = name === 'powershell' ? 'cmd /c exit 3' : 'false'
      const ok = name === 'powershell' ? 'Write-Output ok' : 'echo ok'
      const { term, events } = await run(path, args, [fail, ok, `cd "${target}"`])
      const done = term.commands.filter((c) => c.end !== undefined)
      expect(done.map((c) => [c.text, c.exitCode === 0 ? 0 : 'fail'])).toEqual([
        [fail, 'fail'],
        [ok, 0],
        [`cd "${target}"`, 0],
      ])
      // The reader in the main process sees the same: the folder at the end is the one gone to.
      const cwds = events.filter((e) => e.kind === 'cwd').map((e) => (e as { path: string }).path)
      expect(cwds.at(-1)?.replace(/\\/g, '/').toLowerCase()).toContain(target.split(/[\\/]/).pop()!.toLowerCase())
      expect(events.filter((e) => e.kind === 'command').map((e) => (e as { text: string }).text)).toEqual([fail, ok, `cd "${target}"`])
    }, 120_000)
  }
})

const bashHere = process.platform !== 'win32' && existsSync('/bin/bash')

describe('bash under profiles of its own', () => {
  it.skipIf(!bashHere)('systemd’s prompt function (Ubuntu 26.04) is not taken for a command typed', async () => {
    const home = mkdtempSync(join(tmpdir(), 'shell-home-'))
    writeFileSync(join(home, '.bash_profile'), "__extra_precmd() { :; }\nPROMPT_COMMAND+=('')\nPROMPT_COMMAND+=(__extra_precmd)\n")
    const { term } = await run('/bin/bash', ['-l'], ['false', 'echo ok'], { HOME: home })
    expect(term.commands.filter((c) => c.end !== undefined).map((c) => [c.text, c.exitCode === 0 ? 0 : 'fail'])).toEqual([['false', 'fail'], ['echo ok', 0]])
  }, 120_000)

  it.skipIf(!bashHere)('history turned off: the text is the command being run', async () => {
    const home = mkdtempSync(join(tmpdir(), 'shell-home-'))
    writeFileSync(join(home, '.bash_profile'), 'set +o history\n')
    const { term } = await run('/bin/bash', ['-l'], ['false', 'echo ok'], { HOME: home })
    expect(term.commands.filter((c) => c.end !== undefined).map((c) => c.text)).toEqual(['false', 'echo ok'])
  }, 120_000)
})

describe('which shells, and when not', () => {
  it('knows zsh, bash, PowerShell by their path; leaves others and commands alone', () => {
    expect(shellKind('/opt/homebrew/bin/zsh')).toBe('zsh')
    expect(shellKind('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('powershell')
    expect(shellKind('/usr/bin/fish')).toBeNull()
    const dir = mkdtempSync(join(tmpdir(), 'shell-marks-'))
    expect(integrate('/bin/bash', ['-c', 'ls'], dir)).toBeNull()
    expect(integrate('/bin/bash', [], dir, { SHELL_INTEGRATION: '0' })).toBeNull()
    expect(integrate('/usr/bin/fish', [], dir)).toBeNull()
    expect(integrate('powershell.exe', ['-NoLogo'], dir)!.args.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-EncodedCommand'])
  })
})

describe('events read from output in pieces', () => {
  it('marks, the folder, notifications, a bell; a sequence cut between pieces read when it ends', () => {
    const r = new EventReader()
    expect(r.read('\x1b]133;A\x07$ \x1b]633;E;echo a\\x3bb\x07\x1b]133;C\x07')).toEqual([{ kind: 'prompt' }, { kind: 'command', text: 'echo a;b' }, { kind: 'start' }])
    expect(r.read('a;b\r\n\x1b]133;D;2\x07\x1b]7;file://host/Users/me%20x\x1b')).toEqual([{ kind: 'end', code: 2 }])
    expect(r.read('\\')).toEqual([{ kind: 'cwd', path: '/Users/me x' }])
    expect(r.read('\x1b]7;file://PC/C:/Users/me\x07')).toEqual([{ kind: 'cwd', path: 'C:/Users/me' }])
    expect(r.read('\x1b]9;Claude needs your permission\x07')).toEqual([{ kind: 'notify', text: 'Claude needs your permission' }])
    expect(r.read('\x1b]9;4;1;50\x07')).toEqual([])
    expect(r.read('\x1b]777;notify;Build;done\x07ding\x07')).toEqual([{ kind: 'notify', text: 'Build: done' }, { kind: 'bell' }])
    expect(r.read('plain text')).toEqual([])
  })
})
