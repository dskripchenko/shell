import { describe, expect, it } from 'vitest'
import { hex, importThemes, parseBase16, parseGhostty, parseItermColors, parseWindowsTerminal, UID_DARK } from '../../src/common/themes'

describe('colours as files write them', () => {
  it('#rgb, rrggbb, with alpha, quoted', () => {
    expect(hex('#abc')).toBe('#aabbcc')
    expect(hex('1D1F21')).toBe('#1d1f21')
    expect(hex('"#1d1f21ff"')).toBe('#1d1f21')
    expect(hex('red')).toBeNull()
  })
})

describe('themes of other terminals', () => {
  it('Ghostty', () => {
    const t = parseGhostty('# a comment\npalette = 0=#1d1f21\npalette = 1 = #cc6666\nbackground = 1d1f21\nforeground = c5c8c6\ncursor-color = aeafad\nselection-background = 373b41\n', 'Tomorrow Night')!
    expect(t).toMatchObject({ name: 'Tomorrow Night', kind: 'dark', background: '#1d1f21', foreground: '#c5c8c6', cursor: '#aeafad' })
    expect(t.ansi.slice(0, 2)).toEqual(['#1d1f21', '#cc6666'])
    expect(t.ansi[2]).toBe(UID_DARK.ansi[2]) // not given: the built-in one
    expect(t.selection).toBe('rgba(55, 59, 65, 0.45)')
  })

  it('Windows Terminal: a scheme, or the schemes of settings', () => {
    const scheme = { name: 'Campbell', background: '#0C0C0C', foreground: '#CCCCCC', black: '#0C0C0C', red: '#C50F1F', brightWhite: '#F2F2F2', cursorColor: '#FFFFFF' }
    expect(parseWindowsTerminal(JSON.stringify(scheme))[0]).toMatchObject({ name: 'Campbell', background: '#0c0c0c', cursor: '#ffffff' })
    const settings = `// comments are allowed\n${JSON.stringify({ schemes: [scheme, { ...scheme, name: 'One Half Light', background: '#FAFAFA', foreground: '#383A42' }] })}`
    const both = parseWindowsTerminal(settings)
    expect(both.map((t) => [t.name, t.kind])).toEqual([['Campbell', 'dark'], ['One Half Light', 'light']])
    expect(both[0]!.ansi[15]).toBe('#f2f2f2')
    expect(parseWindowsTerminal('not json')).toEqual([])
  })

  it('iTerm2', () => {
    const color = (key: string, r: number, g: number, b: number) =>
      `<key>${key}</key><dict><key>Alpha Component</key><real>1</real><key>Blue Component</key><real>${b}</real><key>Color Space</key><string>sRGB</string><key>Green Component</key><real>${g}</real><key>Red Component</key><real>${r}</real></dict>`
    const plist = `<?xml version="1.0"?><plist version="1.0"><dict>${color('Ansi 1 Color', 1, 0, 0)}${color('Background Color', 1, 1, 1)}${color('Foreground Color', 0, 0, 0)}</dict></plist>`
    const t = parseItermColors(plist, 'Paper')!
    expect(t).toMatchObject({ name: 'Paper', kind: 'light', background: '#ffffff', foreground: '#000000' })
    expect(t.ansi[1]).toBe('#ff0000')
  })

  it('base16', () => {
    const yaml = 'scheme: "Ocean"\nauthor: "x"\nbase00: "2b303b"\nbase02: "4f5b66"\nbase03: "65737e"\nbase05: "c0c5ce"\nbase07: "eff1f5"\nbase08: "bf616a"\nbase0B: "a3be8c"\n'
    const t = parseBase16(yaml, 'file')!
    expect(t).toMatchObject({ name: 'Ocean', background: '#2b303b', foreground: '#c0c5ce' })
    expect([t.ansi[1], t.ansi[2], t.ansi[8], t.ansi[15]]).toEqual(['#bf616a', '#a3be8c', '#65737e', '#eff1f5'])
  })

  it('a file read by its kind; a file of no kind gives nothing', () => {
    expect(importThemes('/x/Ocean.yaml', 'base00: "000000"\nbase05: "ffffff"\n')).toHaveLength(1)
    expect(importThemes('/x/Night', 'background = 000000\n')).toHaveLength(1)
    expect(importThemes('/x/notes.txt', 'hello')).toEqual([])
  })
})
