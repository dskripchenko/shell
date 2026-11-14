import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compactEdits, editsHookCommand, readEdits } from '@dskripchenko/shell-integration'

const input = (path: string, tool = 'Edit') => JSON.stringify({ session_id: 's1', tool_name: tool, cwd: '/w', tool_input: { file_path: path, content: 'x'.repeat(100) } })

describe('the journal of agents’ edits', () => {
  it('reads edits, leaving out what is not one; written again small', () => {
    const text = [`{"t":10,"pane":"p1","e":${input('/w/a.ts')}}`, 'cut short {"t":', `{"t":11,"e":${JSON.stringify({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'n.ipynb' } })}}`, '{"t":12,"e":{"tool_input":{}}}', ''].join('\n')
    const edits = readEdits(text)
    expect(edits).toEqual([
      { path: '/w/a.ts', pane: 'p1', session: 's1', tool: 'Edit', cwd: '/w', time: 10_000 },
      { path: 'n.ipynb', pane: '', session: '', tool: 'NotebookEdit', cwd: '', time: 11_000 },
    ])
    const small = compactEdits(edits)
    expect(small.length).toBeLessThan(text.length)
    expect(readEdits(small)).toEqual(edits)
  })

  it.skipIf(process.platform === 'win32')('the hook writes into the repository’s git folder (a worktree’s too), the pane cleaned; nothing outside a repository', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'edits-')))
    const repo = join(root, 'repo')
    mkdirSync(repo)
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...a], { cwd: repo, stdio: 'pipe' })
    git('init', '-q')
    git('commit', '-q', '--allow-empty', '-m', 'start')
    git('worktree', 'add', '-q', '-b', 'side', join(root, 'side'))
    const run = (cwd: string, path: string) => execFileSync('sh', ['-c', editsHookCommand()], { cwd, input: input(path), env: { ...process.env, SHELL_PANE_ID: 'p-1;rm -rf "x"' } })
    run(repo, join(repo, 'a.ts'))
    run(join(root, 'side'), join(root, 'side', 'b.ts'))
    const edits = readEdits(readFileSync(join(repo, '.git', 'agent-edits.jsonl'), 'utf8'))
    expect(edits.map((e) => [e.path, e.pane])).toEqual([
      [join(repo, 'a.ts'), 'p-1rm-rfx'],
      [join(root, 'side', 'b.ts'), 'p-1rm-rfx'],
    ])
    const outside = join(root, 'plain')
    mkdirSync(outside)
    expect(() => run(outside, join(outside, 'c.ts'))).not.toThrow()
    expect(existsSync(join(outside, 'agent-edits.jsonl'))).toBe(false)
  })
})
