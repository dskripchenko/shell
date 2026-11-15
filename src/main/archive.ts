/**
 * Archives as folders in the file panels, read only: zip (stored and
 * deflated), tar, tar.gz. Read by Node's zlib — no program needed. Listed
 * once per file and change; files taken out on request (copied out, or brought
 * to a temporary folder to be viewed). A name that would leave the folder it
 * is taken into (`../x`, `/etc/x`) is passed over.
 */
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, open, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { createGunzip, inflateRawSync } from 'node:zlib'
import { archiveKind } from '../common/archive'
import type { Entry } from '../common/commander'
import type { OpResult } from './files'
import { msg } from '../common/i18n'

export interface ArchiveItem {
  /** `/`-separated, no leading slash; a folder without a trailing one. */
  path: string
  kind: 'dir' | 'file'
  size: number
  mtime: number
  /** zip: where its local header is, how it is packed. */
  offset?: number
  method?: number
  packed?: number
}

/** A name kept as a path inside (`a/b`), or null for one that would leave the folder it goes to. */
export function safeName(name: string): string | null {
  const parts = name.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.')
  if (!parts.length || parts.includes('..') || /^[A-Za-z]:$/.test(parts[0]!) || name.startsWith('/')) return null
  return parts.join('/')
}

// zip -------------------------------------------------------------------------------------

function dosTime(date: number, time: number): number {
  return new Date(((date >> 9) & 0x7f) + 1980, ((date >> 5) & 0xf) - 1, date & 0x1f, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2).getTime()
}

async function zipItems(file: string): Promise<ArchiveItem[]> {
  const fh = await open(file, 'r')
  try {
    const size = (await fh.stat()).size
    const tailLen = Math.min(size, 65_557)
    const tail = Buffer.alloc(tailLen)
    await fh.read(tail, 0, tailLen, size - tailLen)
    let eocd = -1
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error(msg().main.notZip)
    const count = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error(msg().main.zip64)
    const cd = Buffer.alloc(cdSize)
    await fh.read(cd, 0, cdSize, cdOffset)
    const out: ArchiveItem[] = []
    let p = 0
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break
      const flags = cd.readUInt16LE(p + 8)
      const method = cd.readUInt16LE(p + 10)
      const time = cd.readUInt16LE(p + 12)
      const date = cd.readUInt16LE(p + 14)
      const packed = cd.readUInt32LE(p + 20)
      const sizeU = cd.readUInt32LE(p + 24)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const offset = cd.readUInt32LE(p + 42)
      const raw = cd.subarray(p + 46, p + 46 + nameLen)
      // Bit 11: the name is UTF-8; else it is CP437, read as Latin-1 (close enough for ASCII).
      const name = (flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1')).replace(/\\/g, '/')
      p += 46 + nameLen + extraLen + commentLen
      const path = safeName(name)
      if (!path) continue
      if (flags & 1) continue // encrypted: not taken
      out.push({ path, kind: name.endsWith('/') ? 'dir' : 'file', size: sizeU, mtime: dosTime(date, time), offset, method, packed })
    }
    return out
  } finally {
    await fh.close()
  }
}

async function zipData(file: string, item: ArchiveItem): Promise<Buffer> {
  const fh = await open(file, 'r')
  try {
    const head = Buffer.alloc(30)
    await fh.read(head, 0, 30, item.offset!)
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(msg().main.damaged)
    const start = item.offset! + 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
    const packed = Buffer.alloc(item.packed!)
    await fh.read(packed, 0, item.packed!, start)
    if (item.method === 0) return packed
    if (item.method === 8) return inflateRawSync(packed, { maxOutputLength: Math.max(item.size, 1) })
    throw new Error(msg().main.compression(item.method ?? 0))
  } finally {
    await fh.close()
  }
}

// tar -------------------------------------------------------------------------------------

/**
 * A tar's entries read in one pass (gunzipped on the way): each header seen,
 * each file's data given to `take` when it wants it (null — passed over).
 */
async function tarPass(file: string, gz: boolean, take: (item: ArchiveItem) => ((data: Buffer) => Promise<void>) | null): Promise<ArchiveItem[]> {
  const items: ArchiveItem[] = []
  let stream: NodeJS.ReadableStream = createReadStream(file)
  if (gz) stream = stream.pipe(createGunzip())
  let buf: Buffer = Buffer.alloc(0)
  let longName: string | null = null
  let paxPath: string | null = null
  let want: { item: ArchiveItem; left: number; parts: Buffer[]; done: ((d: Buffer) => Promise<void>) | null; pad: number; kind: 'data' | 'long' | 'pax' } | null = null
  const str = (b: Buffer, at: number, len: number) => b.subarray(at, at + len).toString('utf8').replace(/\0.*$/s, '')
  const oct = (b: Buffer, at: number, len: number) => parseInt(str(b, at, len).trim() || '0', 8) || 0
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    let p = 0
    while (true) {
      if (want) {
        const n = Math.min(want.left, buf.length - p)
        if (want.done || want.kind !== 'data') want.parts.push(buf.subarray(p, p + n))
        want.left -= n
        p += n
        if (want.left > 0) break
        const data = Buffer.concat(want.parts)
        if (want.kind === 'long') longName = data.toString('utf8').replace(/\0.*$/s, '')
        else if (want.kind === 'pax') paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8'))?.[1] ?? null
        else if (want.done) await want.done(data)
        if (buf.length - p < want.pad) {
          // The padding runs into the next chunk: skipped there.
          want = { ...want, left: want.pad - (buf.length - p), parts: [], done: null, pad: 0, kind: 'data' }
          p = buf.length
          break
        }
        p += want.pad
        want = null
        continue
      }
      if (buf.length - p < 512) break
      const h = buf.subarray(p, p + 512)
      p += 512
      if (h.every((x) => x === 0)) continue
      const type = String.fromCharCode(h[156]!)
      const size = oct(h, 124, 12)
      const pad = (512 - (size % 512)) % 512
      if (type === 'L' || type === 'x') {
        want = { item: { path: '', kind: 'file', size, mtime: 0 }, left: size, parts: [], done: null, pad, kind: type === 'L' ? 'long' : 'pax' }
        continue
      }
      const prefix = str(h, 345, 155)
      const name = paxPath ?? longName ?? (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100))
      longName = paxPath = null
      const path = safeName(name)
      const kind = type === '5' ? 'dir' : type === '0' || type === '\0' || type === '7' ? 'file' : null
      const item = path && kind ? { path, kind, size: kind === 'file' ? size : 0, mtime: oct(h, 136, 12) * 1000 } as ArchiveItem : null
      if (item) items.push(item)
      const done = item && item.kind === 'file' ? take(item) : null
      if (size > 0 || pad > 0) want = { item: item ?? { path: '', kind: 'file', size, mtime: 0 }, left: size, parts: [], done, pad, kind: 'data' }
    }
    buf = buf.subarray(p)
  }
  return items
}

// Listing and taking out -------------------------------------------------------------------

/**
 * The archive without what macOS adds for its own file attributes, hidden by Finder too:
 * `._name` beside `name` (its tar), the `__MACOSX` folder (Archive Utility's zip).
 */
export function withoutMacMeta(items: ArchiveItem[]): ArchiveItem[] {
  const paths = new Set(items.map((i) => i.path))
  return items.filter((i) => {
    if (i.path === '__MACOSX' || i.path.startsWith('__MACOSX/')) return false
    const slash = i.path.lastIndexOf('/')
    const name = i.path.slice(slash + 1)
    return !(i.kind === 'file' && name.startsWith('._') && paths.has(i.path.slice(0, slash + 1) + name.slice(2)))
  })
}

const cache = new Map<string, { key: string; items: ArchiveItem[] }>()

/** Every entry of an archive, folders implied by the files' paths too. */
export async function archiveItems(file: string): Promise<ArchiveItem[]> {
  const st = await stat(file)
  const key = `${st.size}:${st.mtimeMs}`
  const hit = cache.get(file)
  if (hit?.key === key) return hit.items
  const kind = archiveKind(file)
  if (!kind) throw new Error(msg().main.notArchive)
  const items = withoutMacMeta(kind === 'zip' ? await zipItems(file) : await tarPass(file, kind === 'tgz', () => null))
  // Folders only implied by a file inside them.
  const have = new Set(items.map((i) => i.path))
  for (const i of [...items]) {
    const parts = i.path.split('/')
    for (let k = 1; k < parts.length; k++) {
      const dir = parts.slice(0, k).join('/')
      if (!have.has(dir)) {
        have.add(dir)
        items.push({ path: dir, kind: 'dir', size: 0, mtime: i.mtime })
      }
    }
  }
  cache.set(file, { key, items })
  if (cache.size > 16) cache.delete(cache.keys().next().value!)
  return items
}

/** A folder of an archive as the panels list one. */
export async function listArchive(file: string, inner: string): Promise<Entry[]> {
  const items = await archiveItems(file)
  const base = inner.replace(/^\/+|\/+$/g, '')
  const out = new Map<string, Entry>()
  for (const i of items) {
    if (base && !i.path.startsWith(base + '/')) continue
    const rest = base ? i.path.slice(base.length + 1) : i.path
    if (!rest || rest.includes('/')) continue
    out.set(rest, { name: rest, kind: i.kind, size: i.size, mtime: i.mtime, hidden: rest.startsWith('.') })
  }
  if (base && !items.some((i) => i.path === base && i.kind === 'dir')) throw new Error(msg().main.noFolderInArchive)
  return [...out.values()]
}

/** Entries (files, or folders with what is in them) taken out into a folder; nothing written over. */
export async function extractArchive(file: string, inners: string[], target: string): Promise<OpResult> {
  const r: OpResult = { done: [], failed: [] }
  const items = await archiveItems(file)
  const kind = archiveKind(file)!
  const root = resolve(target)
  // Each chosen entry, and the files under a chosen folder, by where they go.
  const dest = new Map<string, string>()
  for (const raw of inners) {
    const inner = raw.replace(/^\/+|\/+$/g, '')
    const top = inner.split('/').slice(0, -1).join('/')
    const chosen = items.filter((i) => i.path === inner || i.path.startsWith(inner + '/'))
    if (!chosen.length) {
      r.failed.push({ path: inner, error: msg().main.notInArchive })
      continue
    }
    for (const i of chosen) {
      const rel = top ? i.path.slice(top.length + 1) : i.path
      const to = resolve(root, ...rel.split('/'))
      if (relative(root, to).startsWith('..')) continue
      dest.set(i.path, to)
    }
    r.done.push(inner)
  }
  const write = async (item: ArchiveItem, data: Buffer) => {
    const to = dest.get(item.path)!
    await mkdir(dirname(to), { recursive: true })
    try {
      await writeFile(to, data, { flag: 'wx' })
      if (item.mtime) await utimes(to, new Date(), new Date(item.mtime))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') r.failed.push({ path: item.path, error: msg().main.nameTaken })
      else throw e
    }
  }
  for (const i of items) if (i.kind === 'dir' && dest.has(i.path)) await mkdir(dest.get(i.path)!, { recursive: true })
  if (kind === 'zip') {
    for (const i of items) if (i.kind === 'file' && dest.has(i.path)) await write(i, await zipData(file, i))
  } else {
    await tarPass(file, kind === 'tgz', (i) => (dest.has(i.path) ? (data) => write(i, data) : null))
  }
  return r
}

/** One file of an archive in a temporary folder, to be viewed. */
export async function fetchFromArchive(file: string, inner: string): Promise<{ local: string } | { error: string }> {
  try {
    const dir = await mkdtemp(join(tmpdir(), 'shell-archive-'))
    const r = await extractArchive(file, [inner], dir)
    if (r.failed.length) return { error: r.failed[0]!.error }
    return { local: join(dir, ...inner.split('/').slice(-1)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

