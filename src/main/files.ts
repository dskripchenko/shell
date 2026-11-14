/**
 * The file panels' work on disk: a folder's entries, copying, moving,
 * renaming, a new folder, deleting to the system's trash, and the start of a
 * file for the quick view.
 */
import { cp, lstat, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { maskTest, type Entry } from '../common/commander'

export async function listDir(dir: string): Promise<Entry[]> {
  const names = await readdir(dir)
  const out: Entry[] = []
  await Promise.all(
    names.map(async (name) => {
      const full = join(dir, name)
      try {
        const l = await lstat(full)
        const kind: Entry['kind'] = l.isSymbolicLink() ? 'link' : l.isDirectory() ? 'dir' : l.isFile() ? 'file' : 'other'
        let linkToDir = false
        if (kind === 'link') {
          try {
            linkToDir = (await stat(full)).isDirectory()
          } catch {
            linkToDir = false
          }
        }
        out.push({ name, kind, size: l.size, mtime: l.mtimeMs, hidden: name.startsWith('.'), ...(linkToDir ? { linkToDir } : {}) })
      } catch {
        // Gone or unreadable meanwhile: not shown.
      }
    }),
  )
  return out
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

export interface OpResult {
  done: string[]
  failed: { path: string; error: string }[]
}

const message = (e: unknown) => (e instanceof Error ? e.message.replace(/^\w+: /, '') : String(e))

/** Items copied into a folder; one already there under the same name is not overwritten. */
export async function copyInto(items: string[], target: string): Promise<OpResult> {
  const r: OpResult = { done: [], failed: [] }
  for (const item of items) {
    const to = join(target, basename(item))
    try {
      if (to === item) throw new Error('копия в ту же папку')
      if (await exists(to)) throw new Error('такое имя уже есть')
      await cp(item, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true })
      r.done.push(to)
    } catch (e) {
      r.failed.push({ path: item, error: message(e) })
    }
  }
  return r
}

/** One item moved (or renamed) to a full path; across disks, copied then removed. */
export async function moveTo(item: string, to: string): Promise<void> {
  if (await exists(to)) throw new Error('такое имя уже есть')
  try {
    await rename(item, to)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await cp(item, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true })
    await rm(item, { recursive: true, force: true })
  }
}

export async function moveInto(items: string[], target: string): Promise<OpResult> {
  const r: OpResult = { done: [], failed: [] }
  for (const item of items) {
    const to = join(target, basename(item))
    try {
      if (to === item) throw new Error('уже в этой папке')
      await moveTo(item, to)
      r.done.push(to)
    } catch (e) {
      r.failed.push({ path: item, error: message(e) })
    }
  }
  return r
}

export async function makeDir(path: string): Promise<void> {
  if (await exists(path)) throw new Error('такое имя уже есть')
  await mkdir(path, { recursive: true })
}

/** The start of a file for the quick view: text, or that it is not text. */
export async function readHead(path: string, limit = 64 * 1024): Promise<{ text: string; truncated: boolean } | { binary: true; size: number }> {
  const f = await open(path, 'r')
  try {
    const size = (await f.stat()).size
    const buf = Buffer.alloc(Math.min(limit, size))
    await f.read(buf, 0, buf.length, 0)
    if (buf.includes(0)) return { binary: true, size }
    return { text: buf.toString('utf8'), truncated: size > limit }
  } finally {
    await f.close()
  }
}

export interface Found {
  path: string
  size: number
  mtime: number
  /** The first line with the text (1-based), when a text was looked for. */
  line?: number
}

/**
 * Files under a folder whose names fit a mask (`*.ts;*.vue`) and, when a text
 * is given, that have it (case aside; binary files and big ones passed over).
 * `.git` and `node_modules` are passed over unless asked. Stops at `limit`
 * results or after `ms`: `partial` says so.
 */
export async function findFiles(root: string, mask: string, text: string, o: { all?: boolean; limit?: number; ms?: number } = {}): Promise<{ items: Found[]; partial: boolean }> {
  const fits = maskTest(mask.trim() || '*')
  const needle = text.toLowerCase()
  const limit = o.limit ?? 2000
  const until = Date.now() + (o.ms ?? 15_000)
  const items: Found[] = []
  const queue = [root]
  while (queue.length) {
    if (items.length >= limit || Date.now() > until) return { items, partial: true }
    const dir = queue.shift()!
    let names: import('node:fs').Dirent[]
    try {
      names = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, d.name)
      if (d.isDirectory()) {
        if (!o.all && (d.name === '.git' || d.name === 'node_modules')) continue
        queue.push(full)
        continue
      }
      if (!d.isFile() || !fits(d.name)) continue
      try {
        const st = await stat(full)
        if (!needle) {
          items.push({ path: full, size: st.size, mtime: st.mtimeMs })
        } else if (st.size <= 4 << 20) {
          const fh = await open(full, 'r')
          try {
            const buf = Buffer.alloc(st.size)
            await fh.read(buf, 0, st.size, 0)
            if (buf.subarray(0, 8192).includes(0)) continue
            const lines = buf.toString('utf8').split('\n')
            const at = lines.findIndex((l) => l.toLowerCase().includes(needle))
            if (at >= 0) items.push({ path: full, size: st.size, mtime: st.mtimeMs, line: at + 1 })
          } finally {
            await fh.close()
          }
        }
      } catch {
        // Unreadable: passed over.
      }
      if (items.length >= limit) return { items, partial: true }
    }
  }
  return { items, partial: false }
}
