/**
 * A terminal's normal screen with its scrollback as plain output to show
 * again: each line's text with its colours and styles, nothing else. No cursor
 * moves, no redraws, no modes — so a program that drew its frames in place
 * (an agent's interface, a progress bar) comes back as the screen it left,
 * and a mode it turned on (the mouse, focus events) stays off. A row wrapped
 * at the right edge is written on with the next, so a pane of another width
 * wraps it again.
 */
import { BLINK, BOLD, COLOR_KIND, CURLY_UNDERLINE, DIM, DOUBLE_UNDERLINE, HIDDEN, INVERSE, ITALIC, LINK_SHIFT, OVERLINE, PALETTE, RGB, STRIKE, UNDERLINE, type Line, type Terminal } from '@dskripchenko/terminal'

/** The modes a program may leave on, off: the mouse, focus events, bracketed paste, keypad and cursor keys, the kitty keyboard. */
export const MODES_OFF = '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?1004l\x1b[?2004l\x1b[?1l\x1b>\x1b[=0;1u'

const STYLES: [number, string][] = [
  [BOLD, '1'],
  [DIM, '2'],
  [ITALIC, '3'],
  [UNDERLINE, '4'],
  [DOUBLE_UNDERLINE, '4:2'],
  [CURLY_UNDERLINE, '4:3'],
  [BLINK, '5'],
  [INVERSE, '7'],
  [HIDDEN, '8'],
  [STRIKE, '9'],
  [OVERLINE, '53'],
]

function color(c: number, base: number): string[] {
  const kind = c & COLOR_KIND
  if (kind === PALETTE) {
    const n = c & 0xff
    if (n < 8) return [String(base + n)]
    if (n < 16) return [String(base + 60 + n - 8)]
    return [`${base + 8};5;${n}`]
  }
  if (kind === RGB) return [`${base + 8};2;${(c >> 16) & 0xff};${(c >> 8) & 0xff};${c & 0xff}`]
  return []
}

/** The escape that sets a cell's look from nothing. */
export function sgrOf(fg: number, bg: number, flags: number): string {
  const parts = ['0', ...STYLES.filter(([bit]) => flags & bit).map(([, p]) => p), ...color(fg, 30), ...color(bg, 40)]
  return `\x1b[${parts.join(';')}m`
}

function lineText(line: Line, end: number, links: readonly string[], state: { look: string; link: number }): string {
  let out = ''
  for (let x = 0; x < end; x++) {
    const w = line.width(x)
    if (w === 0) continue
    const flags = line.flags(x)
    const link = flags >>> LINK_SHIFT
    if (link !== state.link) {
      out += `\x1b]8;;${link ? (links[link] ?? '') : ''}\x1b\\`
      state.link = link
    }
    const look = sgrOf(line.fg(x), line.bg(x), flags & ((1 << LINK_SHIFT) - 1))
    if (look !== state.look) {
      out += look
      state.look = look
    }
    out += line.char(x) || ' '
  }
  return out
}

const PLAIN = sgrOf(0, 0, 0)

/**
 * The normal screen's lines, the oldest dropped to keep within `limit`
 * characters; blank rows at the bottom left out.
 */
export function snapshot(term: Terminal, limit: number): string {
  if (limit <= 0) return ''
  const buf = term.normal
  let last = buf.length - 1
  while (last >= 0 && buf.line(last)!.length() === 0) last--
  const lines: string[] = []
  let current = ''
  const state = { look: PLAIN, link: 0 }
  for (let i = 0; i <= last; i++) {
    const line = buf.line(i)!
    // A wrapped row goes on to the next: all its cells, the blanks at the edge too.
    current += lineText(line, line.wrapped ? line.cols : line.length(), term.links, state)
    if (line.wrapped && i < last) continue
    if (state.link) current += '\x1b]8;;\x1b\\'
    if (state.look !== PLAIN) current += '\x1b[0m'
    state.link = 0
    state.look = PLAIN
    lines.push(current)
    current = ''
  }
  // The newest lines that fit.
  let size = 0
  let from = lines.length
  while (from > 0 && size + lines[from - 1]!.length + 2 <= limit) size += lines[--from]!.length + 2
  return lines.slice(from).map((l) => l + '\r\n').join('')
}
