/** What a file is shown as in the viewer: by its extension, and by its text where the extension says little. */

export type ViewKind =
  | { kind: 'markdown' }
  | { kind: 'diagram'; syntax: string }
  | { kind: 'bpmn' | 'dmn' | 'drawio' | 'openapi' | 'asyncapi' }
  | { kind: 'image' | 'video' | 'audio' }
  | { kind: 'code'; lang: string }
  | { kind: 'binary' }

const DIAGRAMS: Record<string, string> = { mmd: 'mermaid', mermaid: 'mermaid', puml: 'plantuml', plantuml: 'plantuml', pu: 'plantuml', dot: 'dot', gv: 'dot', d2: 'd2', dbml: 'dbml', dsl: 'structurizr', owm: 'wardley' }
const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']
const VIDEOS = ['mp4', 'webm', 'mov', 'm4v', 'ogv']
const AUDIOS = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus']
const LANGS: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  vue: 'vue', json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml', html: 'html', htm: 'html', css: 'css', scss: 'scss',
  py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell', sql: 'sql', graphql: 'graphql', proto: 'protobuf', dockerfile: 'dockerfile', makefile: 'makefile',
  lua: 'lua', r: 'r', dart: 'dart', ex: 'elixir', exs: 'elixir', erl: 'erlang', hs: 'haskell', scala: 'scala', clj: 'clojure', diff: 'diff', patch: 'diff',
}

export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop()!.toLowerCase()
  if (base === 'dockerfile' || base === 'makefile') return base
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1) : ''
}

/** The viewer's kind for a file; its text, when it is text, decides for YAML and JSON (an API description or not). */
export function viewKind(name: string, text: string | null): ViewKind {
  const ext = extOf(name)
  if (IMAGES.includes(ext)) return { kind: 'image' }
  if (VIDEOS.includes(ext)) return { kind: 'video' }
  if (AUDIOS.includes(ext)) return { kind: 'audio' }
  if (text === null) return { kind: 'binary' }
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return { kind: 'markdown' }
  if (DIAGRAMS[ext]) return { kind: 'diagram', syntax: DIAGRAMS[ext]! }
  if (ext === 'bpmn' || ext === 'dmn' || ext === 'drawio') return { kind: ext }
  if (['yaml', 'yml', 'json'].includes(ext)) {
    if (/^\s*["']?openapi["']?\s*:|^\s*["']?swagger["']?\s*:/m.test(text)) return { kind: 'openapi' }
    if (/^\s*["']?asyncapi["']?\s*:/m.test(text)) return { kind: 'asyncapi' }
  }
  return { kind: 'code', lang: LANGS[ext] ?? '' }
}

/** Code as a fenced block of markdown: highlighted by the markdown's renderer; the fence longer than any inside. */
export function codeAsMarkdown(text: string, lang: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${lang}\n${text.replace(/\n$/, '')}\n${fence}\n`
}

/**
 * Paths in a line of output that point at files: `src/a.ts:42`, `./notes.md`,
 * `/abs/file.yaml:3:7`. Found by the terminal's link provider.
 */
// Folders end at a slash, so there is one way to cut a path into them: linear on any line (nested
// repeats over the same characters backtrack exponentially on a long word, and hang the window).
export const PATH_IN_OUTPUT = /(?:~|\.{1,2})?[\\/]?(?:[\w.@-]+[\\/])*[\w@-][\w.@-]*\.[A-Za-z][A-Za-z0-9]{0,9}(?::\d+(?::\d+)?)?/g

/** A path link's file and line. */
export function splitPathLine(text: string): { path: string; line?: number } {
  const m = /^(.*?)(?::(\d+))?(?::\d+)?$/.exec(text)!
  return { path: m[1]!, ...(m[2] ? { line: Number(m[2]) } : {}) }
}

/** A line of markdown as it reads: its marks (headings, lists, quotes, emphasis, links) taken off. */
function plainLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)*/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The line of a document's source where a shown text begins (1-based), or
 * null: what was double-clicked in the rendered page, found in the source by
 * its start, shorter and shorter, the marks of markdown left out.
 */
export function lineOfText(source: string, shown: string): number | null {
  const text = shown.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const lines = source.split('\n').map(plainLine)
  for (const n of [80, 40, 20, 8]) {
    const part = text.slice(0, n).trim()
    if (part.length < Math.min(n, text.length) || !part) continue
    const at = lines.findIndex((l) => l.includes(part))
    if (at >= 0) return at + 1
  }
  return null
}
