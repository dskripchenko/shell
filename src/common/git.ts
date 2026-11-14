/** git's answers read: a folder's status for its tab, a worktree's place. */

export interface GitStatus {
  /** The branch, or a short commit when detached. */
  branch: string
  ahead: number
  behind: number
  /** Files changed, staged or not, and new ones. */
  changed: number
}

/** `git status --porcelain=v2 --branch -z`. */
export function parseStatus(out: string): GitStatus | null {
  let branch: string | null = null
  let oid = ''
  let ahead = 0
  let behind = 0
  let changed = 0
  const records = out.split('\0')
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!
    if (r.startsWith('# branch.head ')) branch = r.slice(14)
    else if (r.startsWith('# branch.oid ')) oid = r.slice(13)
    else if (r.startsWith('# branch.ab ')) {
      const m = /^\+(\d+) -(\d+)$/.exec(r.slice(12))
      if (m) [ahead, behind] = [Number(m[1]), Number(m[2])]
    } else if (/^[12u?] /.test(r)) {
      changed++
      // A rename's record is followed by its old path.
      if (r.startsWith('2 ')) i++
    }
  }
  if (branch === null) return null
  if (branch === '(detached)') branch = oid && oid !== '(initial)' ? oid.slice(0, 7) : 'HEAD'
  return { branch, ahead, behind, changed }
}

/** A branch name as a folder name. */
export function branchSlug(branch: string): string {
  return branch.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'worktree'
}

/** A worktree beside its repository: `<parent>/<repo>-<branch>`. */
export function worktreePath(root: string, branch: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  const trimmed = root.endsWith(sep) ? root.slice(0, -1) : root
  const at = trimmed.lastIndexOf(sep)
  return `${trimmed.slice(0, at)}${sep}${trimmed.slice(at + 1)}-${branchSlug(branch)}`
}
