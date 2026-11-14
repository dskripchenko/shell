/** The file panels' own logic: entries sorted as MC sorts them, masks, sizes, the marked files. */

export interface Entry {
  name: string
  kind: 'dir' | 'file' | 'link' | 'other'
  size: number
  mtime: number
  hidden: boolean
  /** A link that points at a folder: entered like one. */
  linkToDir?: boolean
}

/** One file panel: its folder, entries, cursor, marked names, and why it could not be read. */
export interface PanelState {
  dir: string
  entries: Entry[]
  cursor: number
  marked: string[]
  error: string
}

/** Folders first, then files; by name, numbers in names counted as numbers; `..` on top. */
export function sortEntries(list: Entry[], showHidden: boolean): Entry[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const isDir = (e: Entry) => e.kind === 'dir' || !!e.linkToDir
  return list
    .filter((e) => showHidden || !e.hidden)
    .sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || collator.compare(a.name, b.name))
}

/** A shell-style mask (`*.ts`, `test?.*`, several with `;` or `,`) as a test of a name. */
export function maskTest(mask: string): (name: string) => boolean {
  const parts = mask.split(/[;,]/).map((m) => m.trim()).filter(Boolean)
  if (parts.length === 0) return () => false
  const res = parts.map((m) => new RegExp('^' + m.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'))
  return (name) => res.some((r) => r.test(name))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} ${units[i]}`
}

export function formatTime(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return sameYear ? `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}` : `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** The parent of a path, in its own separators; the root stays itself. */
export function parentOf(path: string): string {
  const win = /^[A-Za-z]:[\\/]/.test(path) || path.includes('\\')
  const sep = win ? '\\' : '/'
  const trimmed = path.length > 1 ? path.replace(/[\\/]+$/, '') : path
  const at = trimmed.lastIndexOf(sep)
  if (at < 0) return path
  if (at === 0) return sep
  if (win && at === 2 && /^[A-Za-z]:/.test(trimmed)) return trimmed.slice(0, 3)
  return trimmed.slice(0, at)
}

export function joinPath(dir: string, name: string): string {
  const sep = /^[A-Za-z]:[\\/]/.test(dir) || dir.includes('\\') ? '\\' : '/'
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}

/** A path as a shell reads it in one word: in single quotes; a quote inside doubled (PowerShell) or closed and escaped (POSIX). */
export function shellQuote(path: string, windows: boolean): string {
  return `'${path.replace(/'/g, windows ? "''" : `'\\''`)}'`
}
