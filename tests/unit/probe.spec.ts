import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitBranch } from '../../src/main/probe'

describe('the git branch of a folder', () => {
  it('found from a folder deep in the repository; detached: the short commit; outside: none', () => {
    const repo = mkdtempSync(join(tmpdir(), 'shell-git-'))
    mkdirSync(join(repo, '.git'))
    mkdirSync(join(repo, 'src', 'deep'), { recursive: true })
    writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/feature/tabs\n')
    expect(gitBranch(join(repo, 'src', 'deep'))).toBe('feature/tabs')
    writeFileSync(join(repo, '.git', 'HEAD'), '3aa78a5c0ffee1234567890\n')
    expect(gitBranch(repo)).toBe('3aa78a5')
    expect(gitBranch(mkdtempSync(join(tmpdir(), 'shell-nogit-')))).toBeNull()
  })

  it('a worktree: .git is a file naming the real folder', () => {
    const real = mkdtempSync(join(tmpdir(), 'shell-wt-real-'))
    writeFileSync(join(real, 'HEAD'), 'ref: refs/heads/review-ui\n')
    const wt = mkdtempSync(join(tmpdir(), 'shell-wt-'))
    writeFileSync(join(wt, '.git'), `gitdir: ${real}\n`)
    expect(gitBranch(wt)).toBe('review-ui')
  })
})
