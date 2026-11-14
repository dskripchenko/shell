import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hookCommand, hooksInstalled, setClaudeHooks, withHooks, withoutHooks } from '../../src/main/claudeHooks'
import { readSignal } from '../../src/main/notify'

describe('signals from shell-notify', () => {
  it('read with the token; refused without it, or with a bad pane or state', () => {
    expect(readSignal('/notify?pane=abc123&state=waiting&message=needs%20you&agent=claude', 'Bearer t', 't')).toEqual({ paneId: 'abc123', state: 'waiting', agent: 'claude', message: 'needs you' })
    expect(readSignal('/notify?pane=abc&state=done&message=&agent=', 'Bearer t', 't')).toEqual({ paneId: 'abc', state: 'done' })
    expect(readSignal('/notify?pane=abc&state=done', 'Bearer x', 't')).toEqual({ error: 401 })
    expect(readSignal('/notify?pane=../x&state=done', 'Bearer t', 't')).toEqual({ error: 400 })
    expect(readSignal('/notify?pane=abc&state=explode', 'Bearer t', 't')).toEqual({ error: 400 })
    expect(readSignal('/other', 'Bearer t', 't')).toEqual({ error: 404 })
  })
})

describe('Claude Code hooks', () => {
  const theirs = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'audit' }] }] }, model: 'opus' }

  it('added beside the person’s own, once; taken out leaving theirs', () => {
    const on = withHooks(theirs)
    expect(hooksInstalled(on)).toBe(true)
    expect((on.hooks!.Stop as unknown[]).length).toBe(2)
    expect(withHooks(on)).toEqual(on)
    const off = withoutHooks(on)
    expect(off).toEqual(theirs)
    expect(hooksInstalled(off)).toBe(false)
    expect(withoutHooks(withHooks({}))).toEqual({})
    expect(hookCommand('done')).toContain('shell-notify done --agent claude')
  })

  it('the settings file: written with a copy of the old one; a file that is not JSON left alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-claude-'))
    const file = join(dir, '.claude', 'settings.json')
    expect(setClaudeHooks(file, true)).toMatch(/подключены/)
    expect(hooksInstalled(JSON.parse(readFileSync(file, 'utf8')))).toBe(true)
    expect(setClaudeHooks(file, true)).toMatch(/уже/)
    expect(setClaudeHooks(file, false)).toMatch(/убраны/)
    expect(JSON.parse(readFileSync(`${file}.before-shell`, 'utf8')).hooks).toBeDefined()
    writeFileSync(file, '{ not json')
    expect(setClaudeHooks(file, true)).toMatch(/не прочитан/)
    expect(readFileSync(file, 'utf8')).toBe('{ not json')
  })
})
