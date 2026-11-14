import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fillPrompt, placesIn, promptFile } from '../../src/common/prompts'
import { PromptStore } from '../../src/main/prompts'

describe('prompts', () => {
  it('places filled in; an unknown one kept; {{ writes {', () => {
    expect(fillPrompt('Tests for {file} on {branch}; {unknown}; {{selection}', { file: '/r/a.ts', branch: 'main' })).toBe('Tests for /r/a.ts on main; {unknown}; {selection}')
    expect(fillPrompt('{selection}', {})).toBe('')
    expect([...placesIn('{clipboard} and {cwd} and {x}')]).toEqual(['clipboard', 'cwd'])
    expect(promptFile('a/b: c?')).toBe('a b c.md')
    expect(promptFile('  ')).toBe('Промпт.md')
  })

  it('kept as files: examples at the first look; a new one under a free name', () => {
    const store = new PromptStore(mkdtempSync(join(tmpdir(), 'shell-prompts-')))
    const first = store.list()
    expect(first.map((p) => p.name)).toContain('Ревью изменений')
    expect(store.add('Ревью изменений', 'mine')).toBe('Ревью изменений 2.md')
    expect(readFileSync(join(store.dir, 'Ревью изменений 2.md'), 'utf8')).toBe('mine\n')
    expect(store.list()).toHaveLength(first.length + 1)
    expect(readdirSync(store.dir).every((f) => f.endsWith('.md'))).toBe(true)
  })
})
