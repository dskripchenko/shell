/**
 * The file panels' work on disk: a folder's entries, copying, moving,
 * renaming, a new folder, deleting to the system's trash, and the start of a
 * file for the quick view.
 */
import { cp, lstat, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Entry } from '../common/commander'

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
