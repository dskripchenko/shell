import { describe, expect, it } from 'vitest'
import { shellEnv, shellOf, Tail } from '../../src/main/pty'

// eslint-disable-next-line no-control-regex -- the escapes are what is looked at
const plain = (s: string) => s.replace(/\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g, '')

describe('a pane’s last output', () => {
  it('the screen as it was drawn: lines, not the redraws that made them', () => {
    const t = new Tail(10_000, 40, 10)
    t.push('first\r\n')
    // A program draws a frame, then draws it again over the first one.
    t.push('\x1b[?2026hframe 1\r\nstatus: working\x1b[?2026l')
    t.push('\x1b[1A\r\x1b[Jframe 2\r\nstatus: \x1b[32mdone\x1b[0m')
    expect(plain(t.text())).toBe('first\r\nframe 2\r\nstatus: done\r\n')
    expect(t.text()).toContain('\x1b[0;32mdone')
  })

  it('no modes come back: the mouse, focus events, the alternate screen', () => {
    const t = new Tail(10_000, 40, 10)
    t.push('\x1b[?1000h\x1b[?1006h\x1b[?1004h\x1b[?2004hprompt % ')
    // eslint-disable-next-line no-control-regex -- the same
    expect(t.text()).not.toMatch(/\x1b\[\?/)
    expect(plain(t.text())).toBe('prompt % \r\n')
  })

  it('zsh’s mark before a prompt, at the width it was written for: no stray row', () => {
    const t = new Tail(10_000, 20, 5)
    t.push('out\r\n\x1b[7m%\x1b[0m' + ' '.repeat(19) + '\r\x1b[Kuser % ls')
    expect(plain(t.text())).toBe('out\r\nuser % ls\r\n')
  })

  it('a row wrapped at the edge goes on with the next: another width wraps it again', () => {
    const t = new Tail(10_000, 10, 5)
    t.push('0123456789abcdef\r\nnext')
    expect(plain(t.text())).toBe('0123456789abcdef\r\nnext\r\n')
    t.resize(30, 5)
    expect(plain(t.text())).toBe('0123456789abcdef\r\nnext\r\n')
  })

  it('the newest lines that fit the limit; nothing with no room', () => {
    const t = new Tail(20, 40, 5)
    for (let i = 0; i < 10; i++) t.push(`line ${i}\r\n`)
    expect(plain(t.text())).toBe('line 8\r\nline 9\r\n')
    t.setLimit(0)
    t.push('x')
    expect(t.text()).toBe('')
  })

  it('a link stays a link', () => {
    const t = new Tail(1000, 40, 5)
    t.push('see \x1b]8;;https://example.org\x1b\\here\x1b]8;;\x1b\\ now')
    expect(t.text()).toContain('\x1b]8;;https://example.org\x1b\\here\x1b]8;;\x1b\\')
  })
})

describe('the shell and its environment', () => {
  it('the user’s shell as a login shell; PowerShell on Windows', () => {
    expect(shellOf({ SHELL: '/opt/homebrew/bin/fish' }, 'darwin', () => true)).toEqual({ file: '/opt/homebrew/bin/fish', args: ['-l'] })
    expect(shellOf({}, 'darwin', (p) => p === '/bin/zsh')).toEqual({ file: '/bin/zsh', args: ['-l'] })
    expect(shellOf({}, 'win32')).toEqual({ file: 'powershell.exe', args: ['-NoLogo'] })
  })

  it('without what started shell itself; saying what the terminal is', () => {
    const env = shellEnv({ HOME: '/h', ELECTRON_RUN_AS_NODE: '1', npm_config_prefix: '/x', PATH: '/repo/node_modules/.bin:/usr/bin', SHELL_DATA: '/d' }, '0.1.0', 'darwin')
    expect(env).toMatchObject({ HOME: '/h', PATH: '/usr/bin', TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'shell', TERM_PROGRAM_VERSION: '0.1.0' })
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.npm_config_prefix).toBeUndefined()
    expect(env.SHELL_DATA).toBeUndefined()
  })
})
