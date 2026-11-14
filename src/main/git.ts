/**
 * git for the tabs: a folder's status (branch, ahead and behind, changed
 * files), and a new worktree beside the repository. The system's git, with
 * optional locks off so a look never gets in an agent's way.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { parseStatus, worktreePath, type GitStatus } from '../common/git'
import { msg } from '../common/i18n'

function git(cwd: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((done, fail) => {
    execFile('git', ['-c', 'core.quotepath=off', ...args], { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }, (err, stdout, stderr) =>
      err ? fail(new Error(stderr.trim() || err.message)) : done(stdout),
    )
  })
}

export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  try {
    return parseStatus(await git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal']))
  } catch {
    return null
  }
}

/** A worktree of `cwd`'s repository on `branch` (made when it does not exist), beside the repository. */
export async function addWorktree(cwd: string, branch: string): Promise<{ path: string } | { error: string }> {
  try {
    const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (!root) return { error: msg().main.notRepo }
    if (branch.startsWith('-')) return { error: msg().main.notBranchName(branch) }
    try {
      await git(root, ['check-ref-format', '--branch', branch])
    } catch {
      return { error: msg().main.notBranchName(branch) }
    }
    const path = worktreePath(root, branch)
    if (existsSync(path)) return { error: msg().main.exists(path) }
    let exists = true
    try {
      await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    } catch {
      exists = false
    }
    await git(root, ['worktree', 'add', ...(exists ? [path, branch] : ['-b', branch, path])], 60_000)
    return { path }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
