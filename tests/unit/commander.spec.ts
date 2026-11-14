import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatSize, joinPath, maskTest, parentOf, sortEntries, type Entry } from '../../src/common/commander'
import { copyInto, listDir, makeDir, moveInto, moveTo, readHead } from '../../src/main/files'

const e = (name: string, kind: Entry['kind'] = 'file', hidden = name.startsWith('.')): Entry => ({ name, kind, size: 0, mtime: 0, hidden })

describe('the panels’ logic', () => {
  it('folders first, numbers as numbers, hidden on request', () => {
    const list = [e('b.txt'), e('src', 'dir'), e('file10'), e('file2'), e('.git', 'dir'), e('A.md')]
    expect(sortEntries(list, false).map((x) => x.name)).toEqual(['src', 'A.md', 'b.txt', 'file2', 'file10'])
    expect(sortEntries(list, true).map((x) => x.name)).toEqual(['.git', 'src', 'A.md', 'b.txt', 'file2', 'file10'])
  })

  it('masks as MC reads them', () => {
    const t = maskTest('*.ts; test?.*')
    expect(['a.ts', 'A.TS', 'test1.md', 'test12.md', 'a.tsx'].filter(t)).toEqual(['a.ts', 'A.TS', 'test1.md'])
    expect(maskTest('')('x')).toBe(false)
  })

  it('sizes and paths', () => {
    expect([formatSize(512), formatSize(1536), formatSize(10 * 1024 * 1024)]).toEqual(['512 Б', '1,5 КБ', '10 МБ'])
    expect(parentOf('/a/b/c')).toBe('/a/b')
    expect(parentOf('/a')).toBe('/')
    expect(parentOf('/')).toBe('/')
    expect(parentOf('C:\\Users\\me')).toBe('C:\\Users')
    expect(parentOf('C:\\Users')).toBe('C:\\')
    expect(joinPath('/a', 'b')).toBe('/a/b')
    expect(joinPath('/', 'b')).toBe('/b')
    expect(joinPath('C:\\Users', 'me')).toBe('C:\\Users\\me')
  })
})

describe('the panels’ work on disk', () => {
  it('lists, copies without overwriting, moves, renames, makes folders, reads the start of a file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shell-files-'))
    const a = join(root, 'a')
    const b = join(root, 'b')
    mkdirSync(join(a, 'sub'), { recursive: true })
    mkdirSync(b)
    writeFileSync(join(a, 'one.txt'), 'hello\n')
    writeFileSync(join(a, 'sub', 'deep.txt'), 'deep')
    writeFileSync(join(a, '.hidden'), '')
    expect((await listDir(a)).map((x) => [x.name, x.kind, x.hidden]).sort()).toEqual([['.hidden', 'file', true], ['one.txt', 'file', false], ['sub', 'dir', false]])

    expect(await copyInto([join(a, 'one.txt'), join(a, 'sub')], b)).toEqual({ done: [join(b, 'one.txt'), join(b, 'sub')], failed: [] })
    expect(readFileSync(join(b, 'sub', 'deep.txt'), 'utf8')).toBe('deep')
    const again = await copyInto([join(a, 'one.txt')], b)
    expect(again.failed[0]!.error).toBe('такое имя уже есть')

    await moveTo(join(b, 'one.txt'), join(b, 'renamed.txt'))
    expect(existsSync(join(b, 'renamed.txt'))).toBe(true)
    expect((await moveInto([join(b, 'renamed.txt')], a)).done).toEqual([join(a, 'renamed.txt')])
    expect(existsSync(join(b, 'renamed.txt'))).toBe(false)

    await makeDir(join(b, 'new', 'deeper'))
    expect(existsSync(join(b, 'new', 'deeper'))).toBe(true)
    await expect(makeDir(join(b, 'new'))).rejects.toThrow('такое имя уже есть')

    expect(await readHead(join(a, 'one.txt'))).toEqual({ text: 'hello\n', truncated: false })
    writeFileSync(join(a, 'bin'), Buffer.from([1, 0, 2]))
    expect(await readHead(join(a, 'bin'))).toEqual({ binary: true, size: 3 })
  })
})

describe('a path for the shell', () => {
  it('quoted in one word on each system', async () => {
    const { shellQuote } = await import('../../src/common/commander')
    expect(shellQuote("/tmp/it's here", false)).toBe("'/tmp/it'\\''s here'")
    expect(shellQuote("C:\\it's", true)).toBe("'C:\\it''s'")
  })
})
