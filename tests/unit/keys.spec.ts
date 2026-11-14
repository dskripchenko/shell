import { describe, expect, it } from 'vitest'
import { chordOf, conflicts, defaultBindings, displayKeys, KeyMatcher, keyOfCode, mergeBindings, normalizeChord, normalizeKeys } from '../../src/common/keys'

const press = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta,
})

describe('chords written as text', () => {
  it('one spelling: modifiers in order, aliases, case', () => {
    expect(normalizeChord('Shift+Cmd+T')).toBe('shift+cmd+t')
    expect(normalizeChord('opt+command+ArrowLeft')).toBe('alt+cmd+left')
    expect(normalizeChord('ctrl+`')).toBe('ctrl+`')
    expect(normalizeChord('cmd++')).toBe('cmd+=')
    expect(normalizeChord('cmd+plus')).toBe('cmd+=')
    expect(normalizeChord('f12')).toBe('f12')
  })

  it('not a chord: two keys, no key, an unknown key', () => {
    expect(normalizeChord('cmd+a+b')).toBeNull()
    expect(normalizeChord('cmd+shift')).toBeNull()
    expect(normalizeChord('cmd+щ')).toBeNull()
    expect(normalizeChord('')).toBeNull()
  })

  it('chains of chords', () => {
    expect(normalizeKeys('Ctrl+A > c')).toBe('ctrl+a>c')
    expect(normalizeKeys('ctrl+a>')).toBeNull()
  })
})

describe('chords read from key presses', () => {
  it('by the key’s place: the same chord on a Russian layout', () => {
    // On ЙЦУКЕН the key in place of T types «е»; its code is still KeyT.
    expect(chordOf(press('KeyT', { meta: true }))).toBe('cmd+t')
    expect(chordOf(press('Digit1', { ctrl: true }))).toBe('ctrl+1')
    expect(chordOf(press('Backquote', { ctrl: true, shift: true }))).toBe('ctrl+shift+`')
  })

  it('a modifier alone is not a chord', () => {
    expect(chordOf(press('ShiftLeft', { shift: true }))).toBeNull()
    expect(keyOfCode('MetaRight')).toBeNull()
  })
})

describe('matching', () => {
  it('a chord runs its command; a chain waits for its next chord', () => {
    const m = new KeyMatcher([
      { keys: 'cmd+t', command: 'tab.new' },
      { keys: 'ctrl+a>c', command: 'agent.new' },
    ])
    expect(m.feed('cmd+t')).toEqual({ kind: 'run', command: 'tab.new' })
    expect(m.feed('ctrl+a')).toEqual({ kind: 'pending' })
    expect(m.pending).toBe(true)
    expect(m.feed('c')).toEqual({ kind: 'run', command: 'agent.new' })
    expect(m.pending).toBe(false)
  })

  it('a chain broken: the chord is tried on its own', () => {
    const m = new KeyMatcher([
      { keys: 'cmd+t', command: 'tab.new' },
      { keys: 'ctrl+a>c', command: 'agent.new' },
    ])
    m.feed('ctrl+a')
    expect(m.feed('cmd+t')).toEqual({ kind: 'run', command: 'tab.new' })
    m.feed('ctrl+a')
    expect(m.feed('x')).toEqual({ kind: 'none' })
  })
})

describe('bindings', () => {
  it('the user’s replace the defaults on the same keys; none takes keys away; bad keys are reported', () => {
    const { bindings, errors } = mergeBindings(
      [{ keys: 'cmd+t', command: 'tab.new' }, { keys: 'cmd+k', command: 'terminal.clear' }],
      { 'Cmd+K': 'palette.open', 'cmd+t': 'none', 'cmd+щ': 'x' },
    )
    expect(bindings).toEqual([{ keys: 'cmd+k', command: 'palette.open' }])
    expect(errors).toHaveLength(1)
  })

  it('a chord that starts a chain hides the chain', () => {
    expect(conflicts([{ keys: 'ctrl+a', command: 'x' }, { keys: 'ctrl+a>c', command: 'y' }])).toEqual([{ keys: 'ctrl+a', commands: ['x', 'y'] }])
  })

  it('the defaults: every binding a real chord, no keys twice, nothing on Ctrl+letter outside a Mac', () => {
    for (const platform of ['mac', 'other'] as const) {
      const list = defaultBindings(platform)
      const keys = list.map((b) => b.keys)
      expect(new Set(keys).size).toBe(keys.length)
      expect(conflicts(list)).toEqual([])
    }
    const other = defaultBindings('other').map((b) => b.keys)
    // One on purpose, as Midnight Commander has it: Ctrl+O for the file panels (a full-screen program keeps it).
    expect(other.filter((k) => /^ctrl\+[a-z]$/.test(k))).toEqual(['ctrl+o'])
  })

  it('shown the way each system writes keys', () => {
    expect(displayKeys('shift+cmd+t', 'mac')).toBe('⇧⌘T')
    expect(displayKeys('ctrl+shift+t', 'other')).toBe('Ctrl+Shift+T')
    expect(displayKeys('ctrl+a>c', 'mac')).toBe('⌃A C')
  })
})

describe('global shortcuts', () => {
  it('written as Electron writes them; a chain is not one', async () => {
    const { toAccelerator } = await import('../../src/common/keys')
    expect(toAccelerator('ctrl+`', 'mac')).toBe('Control+`')
    expect(toAccelerator('cmd+shift+space', 'mac')).toBe('Shift+Command+Space')
    expect(toAccelerator('alt+f12', 'other')).toBe('Alt+F12')
    expect(toAccelerator('ctrl+a>c', 'mac')).toBeNull()
  })
})
