import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addedFile, commentFor, parseDiff } from '../../src/common/diff'
import { changedFiles, fileDiff, headBaseline, inside, takeBaseline } from '../../src/main/changes'

describe('a unified diff read', () => {
  it('hunks, lines and their numbers on both sides', () => {
    const lines = parseDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -2,3 +2,4 @@ fn\n a\n-b\n+B\n+C\n c\n\\ No newline at end of file\n')
    expect(lines).toEqual([
      { kind: 'hunk', text: '@@ -2,3 +2,4 @@ fn' },
      { kind: 'context', text: 'a', old: 2, new: 2 },
      { kind: 'del', text: 'b', old: 3 },
      { kind: 'add', text: 'B', new: 3 },
      { kind: 'add', text: 'C', new: 4 },
      { kind: 'context', text: 'c', old: 4, new: 5 },
    ])
    expect(addedFile('one\ntwo\n').slice(1)).toEqual([{ kind: 'add', text: 'one', new: 1 }, { kind: 'add', text: 'two', new: 2 }])
    expect(commentFor('src/a.ts', { kind: 'add', text: 'x', new: 42 }, ' too wide\n here ')).toBe('src/a.ts:42 — too wide here')
  })
})

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()

describe('what an agent changed since it started', () => {
  it('against its baseline: edits, new files, deletions — not what was already changed or untracked before', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'shell-changes-'))
    g(repo, 'init', '-q')
    g(repo, 'config', 'user.email', 't@t')
    g(repo, 'config', 'user.name', 't')
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n')
    writeFileSync(join(repo, 'gone.txt'), 'bye\n')
    g(repo, 'add', '.')
    g(repo, 'commit', '-qm', 'start')
    // Before the agent: an edit and an untracked file of the person's own.
    writeFileSync(join(repo, 'a.txt'), 'one\nTWO\nthree\n')
    writeFileSync(join(repo, 'mine.txt'), 'mine\n')
    mkdirSync(join(repo, 'sub'))
    const base = (await takeBaseline(join(repo, 'sub')))!
    expect(base.untracked).toEqual(['mine.txt'])
    // The agent: an edit, a new file, a deletion.
    writeFileSync(join(repo, 'a.txt'), 'one\nTWO\nthree\nfour\n')
    writeFileSync(join(repo, 'sub', 'new.ts'), 'export const x = 1\n')
    rmSync(join(repo, 'gone.txt'))
    const files = await changedFiles(base)
    expect(files).toEqual([
      { path: 'a.txt', status: 'modified', adds: 1, dels: 0 },
      { path: 'gone.txt', status: 'deleted', adds: 0, dels: 1 },
      { path: 'sub/new.ts', status: 'added', adds: 1, dels: 0, untracked: true },
    ])
    const d = await fileDiff(base, 'a.txt', false)
    expect('diff' in d && parseDiff(d.diff).filter((l) => l.kind === 'add')).toEqual([{ kind: 'add', text: 'four', new: 4 }])
    expect(await fileDiff(base, 'sub/new.ts', true)).toEqual({ text: 'export const x = 1\n' })
    expect(await fileDiff(base, '../outside', true)).toEqual({ error: 'путь вне репозитория' })
    // With no agent: the working copy against HEAD, new files included.
    const head = (await headBaseline(repo))!
    expect((await changedFiles(head)).map((f) => f.path)).toEqual(['a.txt', 'gone.txt', 'mine.txt', 'sub/new.ts'])
  })

  it('no repository: no baseline; paths outside refused', async () => {
    expect(await takeBaseline(mkdtempSync(join(tmpdir(), 'shell-nogit-')))).toBeNull()
    expect(inside('/r', 'a/b.ts')).toBe(join('/r', 'a', 'b.ts'))
    expect(inside('/r', '../x')).toBeNull()
    expect(inside('/r', '/etc/passwd')).toBeNull()
  })
})
