import { describe, expect, it } from 'vitest'
import { parseConfig } from '../../src/common/config'
import { parseTriggers, plainText, TriggerRunner, type Trigger } from '../../src/common/triggers'

describe('triggers', () => {
  it('read from [[triggers]]; a broken one left out with what is wrong', () => {
    const r = parseConfig(`
[[triggers]]
pattern = "error|failed"
ignore-case = true

[[triggers]]
pattern = "Continue\\\\? \\\\[y/N\\\\]"
action = "send"
text = "y\\r"

[[triggers]]
pattern = "(unclosed"

[[triggers]]
pattern = "x"
action = "explode"

[[triggers]]
pattern = "y"
action = "send"
`)
    expect(r.config.triggers).toEqual([
      { pattern: 'error|failed', action: 'highlight', ignoreCase: true },
      { pattern: 'Continue\\? \\[y/N\\]', action: 'send', text: 'y\r' },
    ])
    expect(r.errors).toHaveLength(3)
    expect(r.errors[0]).toMatch(/№3: pattern не читается/)
    expect(parseTriggers('x', [])).toEqual([])
  })

  it('plain text of output: escape sequences and control characters out', () => {
    expect(plainText('\x1b[31merror\x1b[0m: \x1b]133;A\x07ok\x1b]8;;http://x\x1b\\link\x1b]8;;\x1b\\\x07')).toBe('error: oklink')
  })

  it('fire once a line, on lines ended or not, a carriage return starting over', () => {
    const t: Trigger[] = [
      { pattern: 'done', action: 'notify' },
      { pattern: '\\[y/N\\]', action: 'send', text: 'y\r' },
      { pattern: 'anything', action: 'highlight' },
    ]
    const r = new TriggerRunner(t)
    expect(r.feed('building…\r\n')).toEqual([])
    // A prompt with no end yet fires; more of the same line does not again.
    expect(r.feed('Continue? [y/N]').map((f) => f.trigger.action)).toEqual(['send'])
    expect(r.feed(' ')).toEqual([])
    expect(r.feed('\n')).toEqual([])
    // Split across chunks; colours inside.
    expect(r.feed('all do').length).toBe(0)
    expect(r.feed('\x1b[32mne\x1b[0m\n').map((f) => [f.trigger.action, f.line])).toEqual([['notify', 'all done']])
    // A progress bar redrawn with \r: each drawing is a line of its own.
    expect(r.feed('10% done\r50% done\r').length).toBe(1)
    // Highlights are the view's, not fired.
    expect(r.feed('anything\n')).toEqual([])
  })

  it('with the shell’s marks, only a command’s output — not the line typed at the prompt', () => {
    const r = new TriggerRunner([{ pattern: '\\[y/N\\]', action: 'send', text: 'y\r' }])
    const A = '\x1b]133;A\x07', B = '\x1b]133;B\x07', C = '\x1b]133;C\x07', D = '\x1b]133;D;0\x07'
    expect(r.feed(`${A}$ ${B}read -p "[y/N]" a`)).toEqual([])
    expect(r.feed(`\r\n${C}[y/N] `).map((f) => f.line)).toEqual(['[y/N] '])
    expect(r.feed(`y\r\n${D}${A}$ ${B}echo [y/N]`)).toEqual([])
  })
})
