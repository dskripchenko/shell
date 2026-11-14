/**
 * What a shell's output says besides its text: the integration's marks — a
 * command's text (633;E), its start (133;C), its end with the exit code
 * (133;D), a prompt (133;A) — the folder (OSC 7), and a program asking for
 * attention: OSC 9 with a message (iTerm2's, as Claude Code sends it), OSC 777
 * `notify` (rxvt's), or a lone BEL.
 */
export type ShellEvent =
  | { kind: 'command'; text: string }
  | { kind: 'start' }
  | { kind: 'end'; code: number | null }
  | { kind: 'prompt' }
  | { kind: 'cwd'; path: string }
  | { kind: 'notify'; text: string }
  | { kind: 'bell' }

/** 633;E's escapes: `\x3b` for `;`, `\x0a` for a line break, `\\` for `\`. */
function unescape633(text: string): string {
  return text.replace(/\\x([0-9a-f]{2})|\\\\/gi, (_m, hex: string | undefined) => (hex ? String.fromCharCode(parseInt(hex, 16)) : '\\'))
}

/** A file URL's path: `/C:/x` from Windows as `C:/x`. */
function pathOfUrl(url: string): string | null {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(url)
  if (!m) return null
  let path: string
  try {
    path = decodeURIComponent(m[1]!)
  } catch {
    path = m[1]!
  }
  return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path
}

function eventOf(body: string): ShellEvent | null {
  if (body.startsWith('633;E;')) return { kind: 'command', text: unescape633(body.slice(6)) }
  if (body === '133;C' || body.startsWith('133;C;')) return { kind: 'start' }
  if (body === '133;D' || body.startsWith('133;D;')) {
    const code = Number(body.slice(6))
    return { kind: 'end', code: body.length > 6 && Number.isFinite(code) ? code : null }
  }
  if (body === '133;A' || body.startsWith('133;A;')) return { kind: 'prompt' }
  if (body.startsWith('7;')) {
    const path = pathOfUrl(body.slice(2))
    return path ? { kind: 'cwd', path } : null
  }
  // OSC 9;4;… is a progress bar (ConEmu, Windows Terminal), not a message.
  if (body.startsWith('9;') && !/^9;\d+;/.test(body)) return { kind: 'notify', text: body.slice(2) }
  if (body.startsWith('777;notify;')) return { kind: 'notify', text: body.slice(11).split(';').filter(Boolean).join(': ') }
  return null
}

/**
 * Reads events from a shell's output piece by piece: a sequence cut between
 * two pieces is read whole when its end comes (up to a limit, past which an
 * unended one is dropped).
 */
export class EventReader {
  private pending = ''

  constructor(private readonly limit = 64 * 1024) {}

  read(data: string): ShellEvent[] {
    const text = this.pending + data
    this.pending = ''
    if (!text.includes('\x1b]') && !text.includes('\x07')) return []
    const out: ShellEvent[] = []
    let i = 0
    let bell = false
    while (i < text.length) {
      const osc = text.indexOf('\x1b]', i)
      const bel = text.indexOf('\x07', i)
      if (bel >= 0 && (osc < 0 || bel < osc)) {
        bell = true
        i = bel + 1
        continue
      }
      if (osc < 0) break
      const st1 = text.indexOf('\x07', osc + 2)
      const st2 = text.indexOf('\x1b\\', osc + 2)
      const end = st1 < 0 ? st2 : st2 < 0 ? st1 : Math.min(st1, st2)
      if (end < 0) {
        // Not ended yet: kept for the next piece.
        const rest = text.slice(osc)
        if (rest.length <= this.limit) this.pending = rest
        break
      }
      const e = eventOf(text.slice(osc + 2, end))
      if (e) out.push(e)
      i = end + (text[end] === '\x07' ? 1 : 2)
    }
    if (bell) out.push({ kind: 'bell' })
    return out
  }
}
