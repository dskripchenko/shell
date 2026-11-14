/**
 * Keys: chords written as text (`cmd+shift+t`, a chain `ctrl+a>c`), read from
 * keyboard events by the key's place, not its letter — so `cmd+t` is the same
 * key on a Russian layout — and matched against the bindings.
 */

export type Platform = 'mac' | 'other'

const MODS = ['ctrl', 'alt', 'shift', 'cmd'] as const
type Mod = (typeof MODS)[number]

const MOD_ALIASES: Record<string, Mod> = {
  ctrl: 'ctrl', control: 'ctrl', ctl: 'ctrl',
  alt: 'alt', opt: 'alt', option: 'alt',
  shift: 'shift',
  cmd: 'cmd', command: 'cmd', super: 'cmd', meta: 'cmd', win: 'cmd',
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape', return: 'enter', del: 'delete', ins: 'insert', spacebar: 'space',
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
  plus: '=', equal: '=', minus: '-', backquote: '`', grave: '`', tilde: '`',
  comma: ',', period: '.', slash: '/', backslash: '\\', semicolon: ';', quote: "'",
  bracketleft: '[', bracketright: ']', pgup: 'pageup', pgdn: 'pagedown',
}

/** The key a `KeyboardEvent.code` names, as chords write it; null for a modifier alone. */
export function keyOfCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase()
  const named: Record<string, string> = {
    Enter: 'enter', NumpadEnter: 'enter', Tab: 'tab', Escape: 'escape', Space: 'space', Backspace: 'backspace', Delete: 'delete', Insert: 'insert',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', NumpadAdd: '=', NumpadSubtract: '-',
  }
  return named[code] ?? null
}

/** One chord in its one spelling: modifiers in a fixed order, then the key. Null when it is not a chord. */
export function normalizeChord(text: string): string | null {
  const parts = text.trim().toLowerCase().split('+').map((p) => p.trim())
  // `cmd++` : the last part is the key '+' (written as '=').
  if (parts.length > 1 && parts.at(-1) === '' && parts.at(-2) === '') parts.splice(-2, 2, '=')
  const mods = new Set<Mod>()
  let key: string | null = null
  for (const p of parts) {
    if (p === '') return null
    const mod = MOD_ALIASES[p]
    if (mod) {
      mods.add(mod)
      continue
    }
    if (key !== null) return null
    const k = KEY_ALIASES[p] ?? p
    if (!/^([a-z0-9]|f([1-9]|1[0-9]|2[0-4])|enter|tab|escape|space|backspace|delete|insert|up|down|left|right|home|end|pageup|pagedown|[`\-=[\]\\;',./])$/.test(k)) return null
    key = k
  }
  if (key === null) return null
  return [...MODS.filter((m) => mods.has(m)), key].join('+')
}

/** A whole binding (a chain of chords, `ctrl+a>c`) in its one spelling, or null. */
export function normalizeKeys(text: string): string | null {
  const chords = text.split('>').map(normalizeChord)
  return chords.length > 0 && chords.length <= 4 && chords.every((c) => c !== null) ? chords.join('>') : null
}

export interface KeyEventLike {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** The chord a key press makes; null for a modifier pressed alone. */
export function chordOf(e: KeyEventLike): string | null {
  const key = keyOfCode(e.code)
  if (key === null) return null
  const mods: Mod[] = []
  if (e.ctrlKey) mods.push('ctrl')
  if (e.altKey) mods.push('alt')
  if (e.shiftKey) mods.push('shift')
  if (e.metaKey) mods.push('cmd')
  return [...mods, key].join('+')
}

/** A binding as people read it on this system: `⌘⇧T` on a Mac, `Ctrl+Shift+T` elsewhere. */
export function displayKeys(keys: string, platform: Platform): string {
  return keys
    .split('>')
    .map((chord) => {
      const parts = chord.split('+')
      const key = parts.pop()!
      const name = key.length === 1 ? key.toUpperCase() : ({ up: '↑', down: '↓', left: '←', right: '→', enter: platform === 'mac' ? '↩' : 'Enter', escape: 'Esc', space: 'Space', tab: 'Tab', backspace: platform === 'mac' ? '⌫' : 'Backspace', delete: 'Del', pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End' } as Record<string, string>)[key] ?? key.toUpperCase()
      if (platform === 'mac') return parts.map((m) => ({ ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘' })[m as Mod]).join('') + name
      return [...parts.map((m) => ({ ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', cmd: 'Win' })[m as Mod]), name].join('+')
    })
    .join(platform === 'mac' ? ' ' : ', ')
}

/** A single chord as Electron's global shortcuts write it (`ctrl+\`` → `Control+\``); null for a chain or no chord. */
export function toAccelerator(keys: string, platform: Platform): string | null {
  const chord = normalizeKeys(keys)
  if (!chord || chord.includes('>')) return null
  const parts = chord.split('+')
  const key = parts.pop()!
  const mods = parts.map((m) => ({ ctrl: 'Control', alt: 'Alt', shift: 'Shift', cmd: platform === 'mac' ? 'Command' : 'Super' })[m as Mod])
  const named: Record<string, string> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', enter: 'Enter', escape: 'Escape', space: 'Space', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', insert: 'Insert', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', '=': '=', '-': '-' }
  const name = named[key] ?? (/^f\d+$/.test(key) ? key.toUpperCase() : key.length === 1 ? key.toUpperCase() : key)
  return [...mods, name].join('+')
}

export interface Binding {
  keys: string
  command: string
}

/**
 * The bindings in force: the system's defaults, then the user's — a user's
 * binding replaces whatever the same keys did; `none` takes keys away.
 */
export function mergeBindings(defaults: Binding[], user: Record<string, string>): { bindings: Binding[]; errors: string[] } {
  const byKeys = new Map<string, string>()
  for (const b of defaults) byKeys.set(b.keys, b.command)
  const errors: string[] = []
  for (const [raw, command] of Object.entries(user)) {
    const keys = normalizeKeys(raw)
    if (!keys) {
      errors.push(`не сочетание клавиш: «${raw}»`)
      continue
    }
    if (command === 'none' || command === '') byKeys.delete(keys)
    else byKeys.set(keys, command)
  }
  return { bindings: [...byKeys].map(([keys, command]) => ({ keys, command })), errors }
}

/** Keys bound so that one hides another: a chord that is also the start of a chain. */
export function conflicts(bindings: Binding[]): { keys: string; commands: string[] }[] {
  const out: { keys: string; commands: string[] }[] = []
  for (const a of bindings) {
    const hidden = bindings.filter((b) => b !== a && b.keys.startsWith(a.keys + '>'))
    if (hidden.length) out.push({ keys: a.keys, commands: [a.command, ...hidden.map((b) => b.command)] })
  }
  return out
}

export type MatchResult = { kind: 'run'; command: string } | { kind: 'pending' } | { kind: 'none' }

/** Key presses matched against bindings, chains included. */
export class KeyMatcher {
  private readonly byKeys = new Map<string, string>()
  private readonly prefixes = new Set<string>()
  private typed: string[] = []

  constructor(bindings: Binding[]) {
    for (const b of bindings) {
      this.byKeys.set(b.keys, b.command)
      const chords = b.keys.split('>')
      for (let i = 1; i < chords.length; i++) this.prefixes.add(chords.slice(0, i).join('>'))
    }
  }

  /** Whether a chain was started and waits for its next chord. */
  get pending(): boolean {
    return this.typed.length > 0
  }

  reset(): void {
    this.typed = []
  }

  feed(chord: string): MatchResult {
    const seq = [...this.typed, chord].join('>')
    const command = this.byKeys.get(seq)
    if (command !== undefined) {
      this.typed = []
      return { kind: 'run', command }
    }
    if (this.prefixes.has(seq)) {
      this.typed.push(chord)
      return { kind: 'pending' }
    }
    // A chain broken: the chord is tried on its own.
    if (this.typed.length > 0) {
      this.typed = []
      return this.feed(chord)
    }
    return { kind: 'none' }
  }
}

/**
 * The bindings each system starts with. On a Mac the commands are on ⌘, which
 * no shell program reads; elsewhere Ctrl+letter belongs to the shell (Ctrl+C,
 * Ctrl+D, Ctrl+W), so the commands take Ctrl+Shift, as Windows Terminal does.
 */
export function defaultBindings(platform: Platform): Binding[] {
  const mac = platform === 'mac'
  const m = mac ? 'cmd' : 'ctrl+shift'
  const list: [string, string][] = [
    [mac ? 'cmd+shift+p' : 'ctrl+shift+p', 'palette.open'],
    [mac ? 'cmd+shift+o' : 'ctrl+shift+o', 'project.switch'],
    [mac ? 'cmd+alt+i' : 'ctrl+shift+alt+i', 'input.broadcastTab'],
    [mac ? 'cmd+shift+l' : 'ctrl+shift+l', 'prompts.insert'],
    [`${m}+t`, 'tab.new'],
    [mac ? 'cmd+alt+w' : 'ctrl+shift+alt+w', 'tab.close'],
    ['ctrl+tab', 'tab.next'],
    ['ctrl+shift+tab', 'tab.prev'],
    [mac ? 'cmd+shift+]' : 'ctrl+pagedown', 'tab.next'],
    [mac ? 'cmd+shift+[' : 'ctrl+pageup', 'tab.prev'],
    [mac ? 'cmd+shift+r' : 'ctrl+shift+r', 'tab.rename'],
    [mac ? 'cmd+d' : 'ctrl+shift+d', 'pane.splitRight'],
    [mac ? 'cmd+shift+d' : 'ctrl+shift+e', 'pane.splitDown'],
    [mac ? 'cmd+w' : 'ctrl+shift+w', 'pane.close'],
    [mac ? 'cmd+shift+enter' : 'ctrl+shift+enter', 'pane.zoom'],
    [mac ? 'cmd+alt+left' : 'alt+left', 'pane.focusLeft'],
    [mac ? 'cmd+alt+right' : 'alt+right', 'pane.focusRight'],
    [mac ? 'cmd+alt+up' : 'alt+up', 'pane.focusUp'],
    [mac ? 'cmd+alt+down' : 'alt+down', 'pane.focusDown'],
    [mac ? 'cmd+shift+n' : 'ctrl+shift+n', 'group.new'],
    ['ctrl+alt+right', 'group.next'],
    ['ctrl+alt+left', 'group.prev'],
    [mac ? 'cmd+b' : 'ctrl+shift+b', 'sidebar.toggle'],
    [mac ? 'cmd+shift+g' : 'ctrl+shift+g', 'changes.toggle'],
    // As in Midnight Commander; a full-screen program (vim, less) keeps Ctrl+O for itself.
    ['ctrl+o', 'commander.toggle'],
    [mac ? 'cmd+k' : 'ctrl+shift+k', 'terminal.clear'],
    [mac ? 'cmd+f' : 'ctrl+shift+f', 'terminal.find'],
    [mac ? 'cmd+c' : 'ctrl+shift+c', 'terminal.copy'],
    [mac ? 'cmd+v' : 'ctrl+shift+v', 'terminal.paste'],
    [mac ? 'cmd+a' : 'ctrl+shift+a', 'terminal.selectAll'],
    [mac ? 'cmd+up' : 'ctrl+shift+up', 'terminal.prevCommand'],
    [mac ? 'cmd+down' : 'ctrl+shift+down', 'terminal.nextCommand'],
    [mac ? 'cmd+=' : 'ctrl+=', 'font.bigger'],
    [mac ? 'cmd+-' : 'ctrl+-', 'font.smaller'],
    [mac ? 'cmd+0' : 'ctrl+0', 'font.reset'],
    [mac ? 'cmd+,' : 'ctrl+,', 'settings.open'],
  ]
  for (let i = 1; i <= 9; i++) {
    list.push([mac ? `cmd+${i}` : `alt+${i}`, `tab.select.${i}`])
    list.push([mac ? `ctrl+${i}` : `ctrl+alt+${i}`, `group.select.${i}`])
  }
  return list.map(([keys, command]) => ({ keys: normalizeKeys(keys)!, command }))
}
