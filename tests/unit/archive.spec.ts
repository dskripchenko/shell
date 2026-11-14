import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { archiveKind, archivePath, archiveUp, parseArchive } from '../../src/common/archive'
import { extractArchive, fetchFromArchive, listArchive, safeName } from '../../src/main/archive'

function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

/** A zip of these files (deflated), with a name that would leave the folder too. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text)
    const packed = deflateRawSync(data)
    const n = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(n.length, 26)
    locals.push(local, n, packed)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(0x800, 8)
    c.writeUInt16LE(8, 10)
    c.writeUInt16LE(0x5a00, 14)
    c.writeUInt32LE(crc32(data), 16)
    c.writeUInt32LE(packed.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, n)
    offset += 30 + n.length + packed.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

describe('archives as folders', () => {
  it('known by their names; names that would leave the folder refused', () => {
    expect(archiveKind('a.ZIP')).toBe('zip')
    expect(archiveKind('a.tar.gz')).toBe('tgz')
    expect(archiveKind('a.tgz')).toBe('tgz')
    expect(archiveKind('a.txt')).toBeNull()
    expect(safeName('a/./b/')).toBe('a/b')
    expect(safeName('../etc/passwd')).toBeNull()
    expect(safeName('/etc/passwd')).toBeNull()
    expect(safeName('C:/x')).toBeNull()
    expect(parseArchive(archivePath('/w/a.zip', 'src/lib/'))).toEqual({ file: '/w/a.zip', inner: 'src/lib' })
    expect(archiveUp(archivePath('/w/a.zip', 'src/lib'), () => '')).toBe('archive:/w/a.zip::src')
    expect(archiveUp(archivePath('/w/a.zip'), () => '/w')).toBe('/w')
    expect(parseArchive('/w/a.zip')).toBeNull()
  })

  it('a zip: listed by folders, files taken out, nothing written over, nothing outside', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-zip-'))
    const file = join(dir, 'a.zip')
    writeFileSync(file, zip({ 'readme.md': '# Hi\n', 'src/main.ts': 'export {}\n', 'src/лист.txt': 'юникод\n', '../evil.txt': 'no' }))
    expect((await listArchive(file, '')).map((e) => `${e.name}:${e.kind}`).sort()).toEqual(['readme.md:file', 'src:dir'])
    expect((await listArchive(file, 'src')).map((e) => e.name).sort()).toEqual(['main.ts', 'лист.txt'])
    const out = join(dir, 'out')
    mkdirSync(out)
    expect((await extractArchive(file, ['src'], out)).done).toEqual(['src'])
    expect(readFileSync(join(out, 'src', 'лист.txt'), 'utf8')).toBe('юникод\n')
    expect(existsSync(join(dir, 'evil.txt'))).toBe(false)
    expect((await extractArchive(file, ['src/main.ts'], join(out, 'src'))).failed).toEqual([{ path: 'src/main.ts', error: 'такое имя уже есть' }])
    const fetched = await fetchFromArchive(file, 'readme.md')
    expect('local' in fetched && readFileSync(fetched.local, 'utf8')).toBe('# Hi\n')
  })

  it.skipIf(process.platform === 'win32')('a tar.gz: read in one pass, long names too', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-tgz-'))
    const src = join(dir, 'src')
    const deep = join(src, 'p', 'a'.repeat(60), 'b'.repeat(60))
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(deep, 'deep.txt'), 'far down\n')
    writeFileSync(join(src, 'p', 'big.bin'), Buffer.alloc(70_000, 7))
    execFileSync('tar', ['-czf', join(dir, 'a.tgz'), '-C', src, 'p'])
    expect((await listArchive(join(dir, 'a.tgz'), 'p')).map((e) => e.name).sort()).toEqual(['a'.repeat(60), 'big.bin'])
    const out = join(dir, 'out')
    mkdirSync(out)
    await extractArchive(join(dir, 'a.tgz'), ['p'], out)
    expect(readFileSync(join(out, 'p', 'a'.repeat(60), 'b'.repeat(60), 'deep.txt'), 'utf8')).toBe('far down\n')
    expect(readFileSync(join(out, 'p', 'big.bin')).length).toBe(70_000)
  })
})
