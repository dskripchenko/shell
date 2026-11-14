import { describe, expect, it } from 'vitest'
import { branchSlug, parseStatus, worktreePath } from '../../src/common/git'

describe('git', () => {
  it('reads a status: branch, ahead and behind, files changed', () => {
    const out = ['# branch.oid 1234567890', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1', '1 .M N... 100644 100644 100644 a b src/a.ts', '2 R. N... 100644 100644 100644 a b R100 new.ts', 'old.ts', '? notes.md', ''].join('\0')
    expect(parseStatus(out)).toEqual({ branch: 'main', ahead: 2, behind: 1, changed: 3 })
    expect(parseStatus('# branch.oid abcdef123456\0# branch.head (detached)\0')).toEqual({ branch: 'abcdef1', ahead: 0, behind: 0, changed: 0 })
    expect(parseStatus('# branch.oid (initial)\0# branch.head main\0')).toEqual({ branch: 'main', ahead: 0, behind: 0, changed: 0 })
    expect(parseStatus('')).toBeNull()
  })

  it('puts a worktree beside its repository, named by the branch', () => {
    expect(branchSlug('feature/login form')).toBe('feature-login-form')
    expect(branchSlug('//')).toBe('worktree')
    expect(worktreePath('/w/app', 'feature/x')).toBe('/w/app-feature-x')
    expect(worktreePath('C:/w/app', 'fix')).toBe('C:/w/app-fix')
    expect(worktreePath('C:\\w\\app', 'fix')).toBe('C:\\w\\app-fix')
  })
})
