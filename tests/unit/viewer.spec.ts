import { describe, expect, it } from 'vitest'
import { codeAsMarkdown, PATH_IN_OUTPUT, splitPathLine, viewKind } from '../../src/common/viewer'

describe('what a file is shown as', () => {
  it('by its extension, and by its text for YAML and JSON', () => {
    expect(viewKind('README.md', '# x')).toEqual({ kind: 'markdown' })
    expect(viewKind('flow.mmd', 'graph LR')).toEqual({ kind: 'diagram', syntax: 'mermaid' })
    expect(viewKind('seq.puml', '@startuml')).toEqual({ kind: 'diagram', syntax: 'plantuml' })
    expect(viewKind('order.bpmn', '<x/>')).toEqual({ kind: 'bpmn' })
    expect(viewKind('api.yaml', 'openapi: 3.1.0\ninfo: {}')).toEqual({ kind: 'openapi' })
    expect(viewKind('events.yml', 'asyncapi: 3.0.0')).toEqual({ kind: 'asyncapi' })
    expect(viewKind('ci.yml', 'jobs: {}')).toEqual({ kind: 'code', lang: 'yaml' })
    expect(viewKind('logo.svg', null)).toEqual({ kind: 'image' })
    expect(viewKind('a.ts', 'x')).toEqual({ kind: 'code', lang: 'typescript' })
    expect(viewKind('Dockerfile', 'FROM x')).toEqual({ kind: 'code', lang: 'dockerfile' })
    expect(viewKind('blob.bin', null)).toEqual({ kind: 'binary' })
  })

  it('code as markdown, the fence longer than any inside', () => {
    expect(codeAsMarkdown('let x = 1\n', 'ts')).toBe('```ts\nlet x = 1\n```\n')
    expect(codeAsMarkdown('a\n````\nb', 'md')).toBe('`````md\na\n````\nb\n`````\n')
  })

  it('paths in output, with their lines', () => {
    const found = (s: string) => [...s.matchAll(PATH_IN_OUTPUT)].map((m) => m[0])
    expect(found('Update(src/main/pty.ts) and ./notes.md, see /etc/hosts.conf:12')).toEqual(['src/main/pty.ts', './notes.md', '/etc/hosts.conf:12'])
    expect(found('error at lib/a.test.ts:42:7 — fix')).toEqual(['lib/a.test.ts:42:7'])
    expect(found('pi is 3.14 and v1.2.0')).toEqual([])
    expect(splitPathLine('lib/a.test.ts:42:7')).toEqual({ path: 'lib/a.test.ts', line: 42 })
    expect(splitPathLine('README.md')).toEqual({ path: 'README.md' })
  })
})

describe('paths in output, fast on any line', () => {
  it('a long word with no extension, a long path with no dot: no backtracking', () => {
    for (const line of ['x'.repeat(4000) + '!', '/private/var/folders/5ffp13211fd6cxxydqm770dr0000gn/T/shell-home-AbCdEf'.repeat(50)]) {
      const t = performance.now()
      ;[...line.matchAll(PATH_IN_OUTPUT)]
      expect(performance.now() - t).toBeLessThan(50)
    }
  })
})
