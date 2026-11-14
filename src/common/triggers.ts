/**
 * Triggers: a pattern in a pane's output and what to do when a line has it —
 * highlight it, tell the person (a notification), mark the tab, or type a text
 * into the pane. Set in config.toml as `[[triggers]]`.
 *
 * Lines are read as the output comes: escape sequences taken out, a carriage
 * return starting the line over (a progress bar). A line not ended yet — a
 * prompt such as `Password:` or `[y/N]` — is tried too, and a trigger fires
 * once for a line, ended or not. With a shell that marks its commands
 * (OSC 133), only a command's output is read — never the line typed at the
 * prompt, which would otherwise answer itself.
 */

import { msg } from './i18n'

export type TriggerAction = 'highlight' | 'notify' | 'mark' | 'send'

export interface Trigger {
  pattern: string
  action: TriggerAction
  /** highlight: the background (a CSS colour). */
  color?: string
  /** send: what is typed, as written (`\r` — Enter). */
  text?: string
  ignoreCase?: boolean
}

const ACTIONS: TriggerAction[] = ['highlight', 'notify', 'mark', 'send']
export const HIGHLIGHT = 'rgba(212, 160, 23, 0.35)'

/** `[[triggers]]` read; a broken one left out with what is wrong said. */
export function parseTriggers(value: unknown, errors: string[]): Trigger[] {
  if (!Array.isArray(value)) {
    errors.push(msg().config.triggers.list)
    return []
  }
  const out: Trigger[] = []
  value.forEach((v, i) => {
    const tr = msg().config.triggers
    const at = tr.at(i + 1)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return errors.push(`${at}: ${tr.table}`)
    const t = v as Record<string, unknown>
    for (const k of Object.keys(t)) if (!['pattern', 'action', 'color', 'text', 'ignore-case'].includes(k)) errors.push(`${at}: ${tr.unknown(k)}`)
    if (typeof t.pattern !== 'string' || !t.pattern) return errors.push(`${at}: ${tr.pattern}`)
    const action = (t.action ?? 'highlight') as TriggerAction
    if (!ACTIONS.includes(action)) return errors.push(`${at}: ${tr.action(ACTIONS.join(', '))}`)
    const ignoreCase = t['ignore-case'] === true
    try {
      new RegExp(t.pattern, ignoreCase ? 'i' : '')
    } catch (e) {
      return errors.push(`${at}: ${tr.badPattern(e instanceof Error ? e.message : String(e))}`)
    }
    if (action === 'send' && (typeof t.text !== 'string' || !t.text)) return errors.push(`${at}: ${tr.text}`)
    out.push({
      pattern: t.pattern,
      action,
      ...(typeof t.color === 'string' && t.color ? { color: t.color } : {}),
      ...(typeof t.text === 'string' ? { text: t.text } : {}),
      ...(ignoreCase ? { ignoreCase } : {}),
    })
  })
  return out
}

export function regexOf(t: Trigger, global = false): RegExp {
  return new RegExp(t.pattern, (t.ignoreCase ? 'i' : '') + (global ? 'g' : ''))
}

/** Escape sequences out of output: CSI, OSC (to BEL or ST), the rest of ESC's; other control characters but \n and \r. */
export function plainText(data: string): string {
  /* eslint-disable no-control-regex -- escape sequences are what is taken out */
  return data
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
    .replace(/\x1b[@-Z\\-_]|\x1b[ -/][@-~]?/g, '')
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, '')
  /* eslint-enable no-control-regex */
}

/** The triggers of one pane: fed its output, says which fire on which line. */
export class TriggerRunner {
  private line = ''
  private fired = new Set<number>()
  private readonly res: RegExp[]

  constructor(private readonly triggers: Trigger[]) {
    this.res = triggers.map((t) => regexOf(t))
  }

  /** The shell marks its commands (OSC 133): only a command's output is read, not the line typed at the prompt. */
  private marked = false
  private running = false

  feed(data: string): { trigger: Trigger; line: string }[] {
    const out: { trigger: Trigger; line: string }[] = []
    // The output in runs between the shell's marks: C — a command's output starts; A or D — it is over.
    // eslint-disable-next-line no-control-regex -- the marks are escape sequences
    const MARK = /\x1b\]133;([ACD])[^\x07\x1b]*(?:\x07|\x1b\\)/g
    let at = 0
    for (let m = MARK.exec(data); m; m = MARK.exec(data)) {
      this.read(data.slice(at, m.index), out)
      at = m.index + m[0].length
      this.marked = true
      this.running = m[1] === 'C'
      this.line = ''
      this.fired.clear()
    }
    this.read(data.slice(at), out)
    return out
  }

  private read(data: string, out: { trigger: Trigger; line: string }[]): void {
    if (!data || (this.marked && !this.running)) return
    const parts = plainText(data).split('\n')
    parts.forEach((part, i) => {
      // A carriage return draws the same line again (a progress bar): read anew, fired once all the same.
      part.split('\r').forEach((seg, j) => {
        if (j > 0) this.line = ''
        this.line += seg
        this.test(out)
      })
      if (i < parts.length - 1) {
        this.line = ''
        this.fired.clear()
      }
    })
    // A very long line without an end: its start is enough.
    if (this.line.length > 4096) this.line = this.line.slice(-4096)
  }

  private test(out: { trigger: Trigger; line: string }[]): void {
    if (!this.line) return
    this.res.forEach((re, i) => {
      if (this.fired.has(i) || this.triggers[i]!.action === 'highlight') return
      if (re.test(this.line)) {
        this.fired.add(i)
        out.push({ trigger: this.triggers[i]!, line: this.line })
      }
    })
  }
}
