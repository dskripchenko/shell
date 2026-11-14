import { describe, expect, it } from 'vitest'
import { shellEnv, shellOf, Tail, withoutPictures } from '../../src/main/pty'

describe('a pane’s last output', () => {
  it('keeps the last part, cut after a line break', () => {
    const t = new Tail(12)
    for (let i = 0; i < 10; i++) t.push(`line ${i}\r\n`)
    expect(t.text()).toBe('line 9\r\n')
    expect(t.text().length).toBeLessThanOrEqual(12)
  })

  it('all of it while it fits; nothing with no room', () => {
    const t = new Tail(100)
    t.push('a\r\n')
    t.push('b')
    expect(t.text()).toBe('a\r\nb')
    const none = new Tail(0)
    none.push('x')
    expect(none.text()).toBe('')
  })

  it('a smaller limit applies at once', () => {
    const t = new Tail(1000)
    for (let i = 0; i < 50; i++) t.push(`row ${i}\n`)
    t.setLimit(10)
    expect(t.text()).toBe('row 49\n')
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


describe('the output kept for a restart', () => {
  it('without pictures: whole ones, the end of one cut at the start, one still coming', () => {
    expect(withoutPictures('a\x1b_Ga=T;AAAA\x1b\\b\x1bP0;1q#0!5~\x1b\\c')).toBe('abc')
    expect(withoutPictures('QUFBQUFB\x1b\\after\x1b[31mred')).toBe('after\x1b[31mred')
    expect(withoutPictures('before\x1b_Ga=T;AAA')).toBe('before')
    expect(withoutPictures('\x1b]0;title\x1b\\text')).toBe('\x1b]0;title\x1b\\text')
  })
})
