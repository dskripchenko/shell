/**
 * Claude Code's hooks for shell, put in the user's ~/.claude/settings.json on
 * request (a palette command) and taken out the same way: Notification — it
 * waits for the person; Stop — its turn is done; UserPromptSubmit — it works.
 * Each runs `shell-notify`, which does nothing outside shell's panes. And
 * PostToolUse on edits — the journal of agents' edits shared with folio
 * (`.git/agent-edits.jsonl`, see @dskripchenko/shell-integration). Only
 * shell's entries are touched, found by their marks; everything else stays.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { EDITS_MARK, EDITS_MATCHER, editsHookCommand } from '@dskripchenko/shell-integration'

export const MARK = 'shell-notify'

const EVENTS: [string, string][] = [
  ['Notification', 'waiting'],
  ['Stop', 'done'],
  ['UserPromptSubmit', 'running'],
]

/** The hook's command: shell-notify where it is (a pane of shell), nothing elsewhere. */
export function hookCommand(state: string): string {
  return `command -v shell-notify >/dev/null 2>&1 && shell-notify ${state} --agent claude || true # ${MARK}`
}

type Settings = Record<string, unknown> & { hooks?: Record<string, unknown> }
interface Matcher {
  matcher?: string
  hooks?: { type?: string; command?: string }[]
}

/** Every entry of shell: its event, its matcher (if any), its command, the mark it is known by. */
const ENTRIES: { event: string; matcher?: string; command: string; mark: string }[] = [
  ...EVENTS.map(([event, state]) => ({ event, command: hookCommand(state), mark: MARK })),
  { event: 'PostToolUse', matcher: EDITS_MATCHER, command: editsHookCommand(), mark: EDITS_MARK },
]

const marked = (mark: string) => (m: Matcher) => (m.hooks ?? []).some((h) => typeof h.command === 'string' && h.command.includes(`# ${mark}`))

export function withHooks(settings: Settings): Settings {
  const hooks: Record<string, unknown> = { ...(settings.hooks ?? {}) }
  for (const e of ENTRIES) {
    const ours = marked(e.mark)
    const list = (Array.isArray(hooks[e.event]) ? (hooks[e.event] as Matcher[]) : []).filter((m) => !ours(m))
    list.push({ ...(e.matcher ? { matcher: e.matcher } : {}), hooks: [{ type: 'command', command: e.command }] })
    hooks[e.event] = list
  }
  return { ...settings, hooks }
}

export function withoutHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings
  const hooks: Record<string, unknown> = { ...settings.hooks }
  for (const e of ENTRIES) {
    if (!Array.isArray(hooks[e.event])) continue
    const ours = marked(e.mark)
    const list = (hooks[e.event] as Matcher[]).filter((m) => !ours(m))
    if (list.length) hooks[e.event] = list
    else delete hooks[e.event]
  }
  const out: Settings = { ...settings, hooks }
  if (Object.keys(hooks).length === 0) delete out.hooks
  return out
}

export function hooksInstalled(settings: Settings): boolean {
  return ENTRIES.every((e) => Array.isArray(settings.hooks?.[e.event]) && (settings.hooks![e.event] as Matcher[]).some(marked(e.mark)))
}

/** The settings file changed: a copy of the old one kept beside it first. Says what happened, in words. */
export function setClaudeHooks(file: string, on: boolean): string {
  let settings: Settings = {}
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8')) as Settings
    } catch {
      return `${file} не прочитан как JSON — ничего не изменено`
    }
  }
  const next = on ? withHooks(settings) : withoutHooks(settings)
  if (JSON.stringify(next) === JSON.stringify(settings)) return on ? 'Хуки Claude Code уже подключены' : 'Хуков shell в Claude Code нет'
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file)) copyFileSync(file, `${file}.before-shell`)
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
  return on ? `Хуки Claude Code подключены: ${file}` : `Хуки shell убраны из ${file}`
}
