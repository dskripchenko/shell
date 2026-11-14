/**
 * The prompt library: texts for agents kept as files (`shell-data/prompts/*.md`,
 * one a prompt, its name the file's), with places filled in when one is used:
 * `{selection}` — what is selected in the pane, `{file}` — the file in the
 * viewer, `{cwd}` — the pane's folder, `{branch}`, `{clipboard}`.
 */

import { msg } from './i18n'

export interface Prompt {
  name: string
  text: string
}

export const PLACES = ['selection', 'file', 'cwd', 'branch', 'clipboard'] as const
export type Places = Partial<Record<(typeof PLACES)[number], string>>

/** The text with its places filled in (an unknown `{word}` left as it is; `{{` writes `{`). */
export function fillPrompt(text: string, places: Places): string {
  return text.replace(/\{\{|\{(\w+)\}/g, (all, name: string | undefined) => {
    if (all === '{{') return '{'
    return name && (PLACES as readonly string[]).includes(name) ? (places[name as keyof Places] ?? '') : all
  })
}

/** Which places a text uses (to ask only for what it needs, such as the clipboard). */
export function placesIn(text: string): Set<string> {
  return new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((n) => (PLACES as readonly string[]).includes(n)))
}

/** A file name for a prompt's name: what a file system takes, `.md` after it. */
export function promptFile(name: string): string {
  // eslint-disable-next-line no-control-regex -- what no file system takes
  const base = name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || msg().prompts.untitled
  return `${base}.md`
}

/** The prompts a fresh library starts with, in the language in use. */
export function examples(): Prompt[] {
  return msg().prompts.examples.map((p) => ({ ...p }))
}
