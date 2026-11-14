/**
 * Colour themes of the terminal: the two built in (UID Design System, dark
 * and light) and others read from the files other terminals keep them in —
 * iTerm2 (`.itermcolors`), Ghostty, Windows Terminal (JSON) and base16 (YAML).
 */

export interface Theme {
  name: string
  kind: 'dark' | 'light'
  background: string
  foreground: string
  cursor: string
  selection: string
  /** The 16 colours: black, red, green, yellow, blue, magenta, cyan, white, then their bright forms. */
  ansi: string[]
}

export const UID_DARK: Theme = {
  name: 'UID Dark',
  kind: 'dark',
  background: '#1c1c1e',
  foreground: '#f4f4f5',
  cursor: '#f4f4f5',
  selection: 'rgba(45, 212, 191, 0.28)',
  ansi: ['#3a3a3c', '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#c4b5fd', '#2dd4bf', '#d4d4d8', '#71717a', '#fda4af', '#6ee7b7', '#fcd34d', '#93c5fd', '#ddd6fe', '#5eead4', '#fafafa'],
}

export const UID_LIGHT: Theme = {
  name: 'UID Light',
  kind: 'light',
  background: '#fafafa',
  foreground: '#18181b',
  cursor: '#18181b',
  selection: 'rgba(20, 184, 166, 0.25)',
  ansi: ['#3f3f46', '#be123c', '#047857', '#b45309', '#1d4ed8', '#7e22ce', '#0f766e', '#a1a1aa', '#71717a', '#e11d48', '#059669', '#d97706', '#2563eb', '#9333ea', '#0d9488', '#52525b'],
}

export const BUILT_IN: Theme[] = [UID_DARK, UID_LIGHT]

/** The built-in themes' names before they were English: a config that says them still finds them. */
const ALIASES: Record<string, string> = { 'UID тёмная': 'UID Dark', 'UID светлая': 'UID Light' }

/** A theme by its name (or a former name of a built-in one). */
export function themeNamed(all: Theme[], name: string): Theme | undefined {
  const want = ALIASES[name] ?? name
  return all.find((t) => t.name === want)
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** `#rrggbb` from the ways files write a colour; null when it is none. */
export function hex(value: string): string | null {
  const v = value.trim().replace(/^["']|["']$/g, '')
  const m = HEX.exec(v)
  if (!m) return null
  let h = m[1]!.toLowerCase()
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return '#' + h.slice(0, 6)
}

function luminance(color: string): number {
  const h = hex(color) ?? '#000000'
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function translucent(color: string, alpha: number): string {
  const h = hex(color) ?? '#808080'
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${alpha})`
}

function complete(name: string, parts: { background?: string | null; foreground?: string | null; cursor?: string | null; selection?: string | null; ansi: (string | null | undefined)[] }): Theme {
  const kind = parts.background && luminance(parts.background) > 0.4 ? 'light' : 'dark'
  const base = kind === 'light' ? UID_LIGHT : UID_DARK
  const background = parts.background ?? base.background
  const foreground = parts.foreground ?? base.foreground
  return {
    name,
    kind,
    background,
    foreground,
    cursor: parts.cursor ?? foreground,
    selection: parts.selection ? translucent(parts.selection, 0.45) : translucent(foreground, 0.22),
    ansi: base.ansi.map((c, i) => parts.ansi[i] ?? c),
  }
}

/** Ghostty: `palette = 0=#1d1f21`, `background = 1d1f21`, `cursor-color`, `selection-background`. */
export function parseGhostty(text: string, name: string): Theme | null {
  const ansi: (string | null)[] = []
  const v: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key === 'palette') {
      const m = /^(\d+)\s*=\s*(.+)$/.exec(value)
      if (m && Number(m[1]) < 16) ansi[Number(m[1])] = hex(m[2]!)
    } else v[key] = value
  }
  if (!v.background && !v.foreground && ansi.length === 0) return null
  return complete(name, { background: v.background && hex(v.background), foreground: v.foreground && hex(v.foreground), cursor: v['cursor-color'] && hex(v['cursor-color']), selection: v['selection-background'] && hex(v['selection-background']), ansi })
}

const WT_ORDER = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightPurple', 'brightCyan', 'brightWhite']

/** Windows Terminal: one scheme, a list of them, or settings with `schemes`. */
export function parseWindowsTerminal(text: string): Theme[] {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''))
  } catch {
    return []
  }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { schemes?: unknown }).schemes) ? (data as { schemes: unknown[] }).schemes : [data]
  const out: Theme[] = []
  for (const s of list) {
    if (!s || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    const get = (k: string) => (typeof o[k] === 'string' ? hex(o[k] as string) : null)
    if (!get('background') && !get('foreground')) continue
    out.push(complete(typeof o.name === 'string' ? o.name : 'Windows Terminal', { background: get('background'), foreground: get('foreground'), cursor: get('cursorColor'), selection: get('selectionBackground'), ansi: WT_ORDER.map(get) }))
  }
  return out
}

/** iTerm2's `.itermcolors`: a property list of colours with Red, Green and Blue components from 0 to 1. */
export function parseItermColors(text: string, name: string): Theme | null {
  const colors = new Map<string, string>()
  const entry = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
  for (const m of text.matchAll(entry)) {
    const comp = (c: string) => {
      const r = new RegExp(`<key>${c} Component</key>\\s*<real>([^<]+)</real>`).exec(m[2]!)
      return r ? Math.round(Math.max(0, Math.min(1, Number(r[1]))) * 255) : null
    }
    const [r, g, b] = [comp('Red'), comp('Green'), comp('Blue')]
    if (r === null || g === null || b === null) continue
    colors.set(m[1]!.trim(), '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join(''))
  }
  if (colors.size === 0) return null
  return complete(name, {
    background: colors.get('Background Color'),
    foreground: colors.get('Foreground Color'),
    cursor: colors.get('Cursor Color'),
    selection: colors.get('Selection Color'),
    ansi: Array.from({ length: 16 }, (_, i) => colors.get(`Ansi ${i} Color`)),
  })
}

/** base16 (YAML): base00…base0F, laid on the 16 colours as base16-shell lays them. */
export function parseBase16(text: string, fallbackName: string): Theme | null {
  const v: Record<string, string> = {}
  let name = fallbackName
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/.exec(line)
    if (!m) continue
    if (m[1] === 'scheme' || m[1] === 'name') name = m[2]!.trim()
    else v[m[1]!.toLowerCase()] = m[2]!
  }
  const b = (n: string) => (v[`base${n}`] ? hex(v[`base${n}`]!) : null)
  if (!b('00') || !b('05')) return null
  const ansi = ['00', '08', '0b', '0a', '0d', '0e', '0c', '05', '03', '08', '0b', '0a', '0d', '0e', '0c', '07'].map(b)
  return complete(name, { background: b('00'), foreground: b('05'), cursor: b('05'), selection: b('02'), ansi })
}

/** The themes a file holds, read by its kind; none when it is not one of the kinds known. */
export function importThemes(fileName: string, text: string): Theme[] {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.itermcolors') || text.includes('<plist')) {
    const t = parseItermColors(text, base)
    return t ? [t] : []
  }
  if (lower.endsWith('.json')) return parseWindowsTerminal(text)
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    const t = parseBase16(text, base)
    return t ? [t] : []
  }
  const t = parseGhostty(text, base)
  return t ? [t] : []
}

/** The themes shell shows by day and by night: the chosen one both times, or the system's pair (`name = "system"`). */
export function lookOf(theme: { name: string; light: string; dark: string }, imported: Theme[]): { light: Theme; dark: Theme } {
  const all = [...BUILT_IN, ...imported]
  const find = (name: string, fallback: Theme) => themeNamed(all, name) ?? fallback
  if (theme.name !== 'system') {
    const one = find(theme.name, UID_DARK)
    return { light: one, dark: one }
  }
  return { light: find(theme.light, UID_LIGHT), dark: find(theme.dark, UID_DARK) }
}
