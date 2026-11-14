/** A unified diff (git's) read into lines with their numbers on both sides. */

import { msg } from './i18n'

export interface DiffLine {
  kind: 'hunk' | 'context' | 'add' | 'del'
  text: string
  /** The line's number before and after; a hunk header has neither. */
  old?: number
  new?: number
}

export function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let o = 0
  let n = 0
  let inHunk = false
  for (const raw of text.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw)
    if (h) {
      o = Number(h[1])
      n = Number(h[2])
      inHunk = true
      out.push({ kind: 'hunk', text: raw })
      continue
    }
    if (!inHunk || raw.startsWith('\\')) continue
    const sign = raw[0]
    const body = raw.slice(1)
    if (sign === '+') out.push({ kind: 'add', text: body, new: n++ })
    else if (sign === '-') out.push({ kind: 'del', text: body, old: o++ })
    else if (sign === ' ') out.push({ kind: 'context', text: body, old: o++, new: n++ })
  }
  return out
}

/** A new file's text as a diff: every line added. */
export function addedFile(text: string): DiffLine[] {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
  if (text === '') return []
  return [{ kind: 'hunk', text: `@@ -0,0 +1,${lines.length} @@ ${msg().changes.newFile}` }, ...lines.map((t, i) => ({ kind: 'add' as const, text: t, new: i + 1 }))]
}

/** What goes to an agent about a line: `file:line — comment`, on one line. */
export function commentFor(file: string, line: DiffLine, comment: string): string {
  const at = line.new ?? line.old
  return `${file}${at ? `:${at}` : ''} — ${comment.replace(/\s*\n\s*/g, ' ').trim()}`
}
