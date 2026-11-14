/**
 * Claude Code's hooks for shell, put in the user's ~/.claude/settings.json on
 * request (a palette command) and taken out the same way: Notification — it
 * waits for the person; Stop — its turn is done; UserPromptSubmit — it works.
 * Each runs `shell-notify`, which does nothing outside shell's panes. Only
 * shell's entries are touched, found by their mark; everything else stays.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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

const ours = (m: Matcher) => (m.hooks ?? []).some((h) => typeof h.command === 'string' && h.command.includes(`# ${MARK}`))

export function withHooks(settings: Settings): Settings {
  const hooks: Record<string, unknown> = { ...(settings.hooks ?? {}) }
  for (const [event, state] of EVENTS) {
    const list = (Array.isArray(hooks[event]) ? (hooks[event] as Matcher[]) : []).filter((m) => !ours(m))
    list.push({ hooks: [{ type: 'command', command: hookCommand(state) }] })
    hooks[event] = list
  }
  return { ...settings, hooks }
}

export function withoutHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings
  const hooks: Record<string, unknown> = { ...settings.hooks }
  for (const [event] of EVENTS) {
    if (!Array.isArray(hooks[event])) continue
    const list = (hooks[event] as Matcher[]).filter((m) => !ours(m))
    if (list.length) hooks[event] = list
    else delete hooks[event]
  }
  const out: Settings = { ...settings, hooks }
  if (Object.keys(hooks).length === 0) delete out.hooks
  return out
}

export function hooksInstalled(settings: Settings): boolean {
  return EVENTS.every(([event]) => Array.isArray(settings.hooks?.[event]) && (settings.hooks![event] as Matcher[]).some(ours))
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
