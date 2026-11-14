/**
 * The settings: `config.toml` in the data folder, read again whenever it
 * changes. A mistake in it never stops the terminal — the setting keeps its
 * default and the mistake is said, by its place in the file.
 */
import { parse } from 'smol-toml'
import { DEFAULT_AGENTS } from './agents'
import { parseTriggers, type Trigger } from './triggers'
import { messagesOf, msg, type Lang } from './i18n'

/** A way to start a shell: its program, arguments, environment, folder and theme. */
export interface Profile {
  program?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  theme?: string
}

export interface Config {
  font: { family: string; size: number; lineHeight: number }
  /** `system` follows the system's light or dark; or a theme by name, built in or imported. */
  theme: { name: string; light: string; dark: string }
  /** The interface's language: "auto" (the system's), en, ru, de, zh. */
  ui: { language: string }
  shell: { program: string; args: string[] }
  scrollback: { lines: number; restore: boolean; restoreKb: number }
  window: { dimInactive: number }
  quake: { enabled: boolean; hotkey: string; height: number }
  updates: { auto: boolean }
  /** Commands that start an AI agent; whether the system is told when one waits or is done. */
  agents: { commands: string[]; notify: boolean }
  /** folio: where it is when not found by itself ('' — found by itself); `enabled = false` hides it. */
  folio: { path: string; enabled: boolean }
  /** macOS: Secure Keyboard Entry — other programs cannot read the keys typed in shell. */
  security: { secureKeyboard: boolean }
  /** Patterns in the output and what each does (`[[triggers]]`). */
  triggers: Trigger[]
  /** Keys of the user's own: `"cmd+t" = "tab.new"`, `"cmd+k" = "none"`. */
  keys: Record<string, string>
  profiles: Record<string, Profile>
}

export const DEFAULTS: Config = {
  font: { family: "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace", size: 13, lineHeight: 1.3 },
  theme: { name: 'system', light: 'UID Light', dark: 'UID Dark' },
  ui: { language: 'auto' },
  shell: { program: '', args: [] },
  scrollback: { lines: 10000, restore: true, restoreKb: 512 },
  window: { dimInactive: 0.8 },
  quake: { enabled: true, hotkey: 'ctrl+alt+`', height: 0.45 },
  updates: { auto: true },
  agents: { commands: [...DEFAULT_AGENTS], notify: true },
  folio: { path: '', enabled: true },
  security: { secureKeyboard: false },
  triggers: [],
  keys: {},
  profiles: {},
}

/** config.toml as it is written at the first start, its comments in a language. */
export function defaultText(lang: Lang = 'en'): string {
  const c = messagesOf(lang).configFile
  return `${c.head}

[font]
# family = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace"
# size = 13
# line-height = 1.3

[theme]
${c.theme}
# name = "system"
# light = "UID Light"
# dark = "UID Dark"

[ui]
${c.ui}
# language = "auto"

[shell]
${c.shell}
# program = ""
# args = []

[scrollback]
# lines = 10000
${c.restore}
# restore = true
${c.restoreKb}
# restore-kb = 512

[window]
${c.dim}
# dim-inactive = 0.8

[quake]
${c.quake}
# enabled = true
# hotkey = "ctrl+alt+\`"
${c.height}
# height = 0.45

[updates]
${c.updates}
# auto = true

[agents]
${c.agents}
# commands = ["claude", "codex", "grok", "gemini", "aider", "opencode", "cursor-agent", "amp", "qwen", "goose"]
${c.notify}
# notify = true

[folio]
${c.folio}
# path = ""
# enabled = true

[security]
${c.security}
# secure-keyboard = false

[keys]
${c.keys}
# "cmd+k" = "palette.open"
# "ctrl+a>c" = "tab.new"

${c.triggers}
# [[triggers]]
# pattern = "error|failed"
# action = "highlight"
# ignore-case = true
# [[triggers]]
# pattern = "tests passed"
# action = "notify"

${c.profiles}
# [profiles.python]
# program = "/bin/zsh"
# args = ["-l"]
# env = { VIRTUAL_ENV_DISABLE_PROMPT = "1" }
# cwd = "~/projects"
# theme = "UID Light"
`
}

/** The file in English (tests, a first start before the language is known). */
export const DEFAULT_TEXT = defaultText('en')

export interface ConfigResult {
  config: Config
  errors: string[]
}

type Kind = 'string' | 'number' | 'boolean' | 'strings'

export const FIELDS: Record<string, Record<string, { key: string; kind: Kind; min?: number; max?: number }>> = {
  font: { family: { key: 'family', kind: 'string' }, size: { key: 'size', kind: 'number', min: 6, max: 72 }, 'line-height': { key: 'lineHeight', kind: 'number', min: 0.8, max: 3 } },
  theme: { name: { key: 'name', kind: 'string' }, light: { key: 'light', kind: 'string' }, dark: { key: 'dark', kind: 'string' } },
  shell: { program: { key: 'program', kind: 'string' }, args: { key: 'args', kind: 'strings' } },
  scrollback: { lines: { key: 'lines', kind: 'number', min: 0, max: 1_000_000 }, restore: { key: 'restore', kind: 'boolean' }, 'restore-kb': { key: 'restoreKb', kind: 'number', min: 0, max: 65536 } },
  window: { 'dim-inactive': { key: 'dimInactive', kind: 'number', min: 0.5, max: 1 } },
  quake: { enabled: { key: 'enabled', kind: 'boolean' }, hotkey: { key: 'hotkey', kind: 'string' }, height: { key: 'height', kind: 'number', min: 0.15, max: 1 } },
  updates: { auto: { key: 'auto', kind: 'boolean' } },
  agents: { commands: { key: 'commands', kind: 'strings' }, notify: { key: 'notify', kind: 'boolean' } },
  folio: { path: { key: 'path', kind: 'string' }, enabled: { key: 'enabled', kind: 'boolean' } },
  security: { 'secure-keyboard': { key: 'secureKeyboard', kind: 'boolean' } },
  ui: { language: { key: 'language', kind: 'string' } },
}

const PROFILE_FIELDS: Record<string, Kind | 'table'> = { program: 'string', args: 'strings', env: 'table', cwd: 'string', theme: 'string' }

function parseProfile(name: string, value: unknown, errors: string[]): Profile | null {
  if (!/^[\w.-]{1,40}$/.test(name)) {
    errors.push(msg().config.profileName(name))
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(msg().config.profileTable(name))
    return null
  }
  const out: Profile = {}
  for (const [k, v] of Object.entries(value)) {
    const kind = PROFILE_FIELDS[k]
    if (!kind) {
      errors.push(msg().config.profileUnknown(name, k))
      continue
    }
    if (kind === 'table') {
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.values(v).every((x) => typeof x === 'string')) {
        errors.push(msg().config.profileEnv(name, k))
        continue
      }
      out.env = { ...(v as Record<string, string>) }
      continue
    }
    if (!fits(v, kind)) {
      errors.push(msg().config.profileKind(name, k, kind === 'strings'))
      continue
    }
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

function fits(value: unknown, kind: Kind): boolean {
  if (kind === 'strings') return Array.isArray(value) && value.every((v) => typeof v === 'string')
  return typeof value === kind && (kind !== 'number' || Number.isFinite(value))
}

export function parseConfig(text: string): ConfigResult {
  const config = structuredClone(DEFAULTS)
  const errors: string[] = []
  let data: Record<string, unknown>
  try {
    data = parse(text) as Record<string, unknown>
  } catch (e) {
    const message = e instanceof Error ? e.message.split('\n')[0]! : String(e)
    return { config, errors: [msg().config.notRead(message)] }
  }
  for (const [section, value] of Object.entries(data)) {
    if (section === 'profiles') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [name, p] of Object.entries(value)) {
          const profile = parseProfile(name, p, errors)
          if (profile) config.profiles[name] = profile
        }
      } else errors.push(msg().config.profilesTable)
      continue
    }
    if (section === 'triggers') {
      config.triggers = parseTriggers(value, errors)
      continue
    }
    if (section === 'keys') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
          if (typeof v === 'string') config.keys[k] = v
          else errors.push(msg().config.keyName(k))
        }
      } else errors.push(msg().config.keysTable)
      continue
    }
    const fields = FIELDS[section]
    if (!fields || !value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(msg().config.unknownSection(section))
      continue
    }
    for (const [name, v] of Object.entries(value)) {
      const f = fields[name]
      if (!f) {
        errors.push(msg().config.unknownSetting(section, name))
        continue
      }
      if (!fits(v, f.kind)) {
        errors.push(msg().config.expected(section, name, f.kind))
        continue
      }
      if (f.kind === 'number' && ((f.min !== undefined && (v as number) < f.min) || (f.max !== undefined && (v as number) > f.max))) {
        errors.push(msg().config.range(section, name, f.min, f.max))
        continue
      }
      ;(config as unknown as Record<string, Record<string, unknown>>)[section]![f.key] = v
    }
  }
  return { config, errors }
}

/** A value as TOML writes it. */
function tomlValue(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

/**
 * The config's text with one setting set, the rest as it was — comments,
 * order, the person's own lines: the line of the setting replaced, or written
 * under its commented example, or under its section's header, or in a new
 * section at the end.
 */
export function setConfigValue(text: string, section: string, key: string, value: string | number | boolean | string[]): string {
  const lines = text.split('\n')
  const line = `${key} = ${tomlValue(value)}`
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
  const header = lines.findIndex((l) => new RegExp(`^\\s*\\[${esc(section)}\\]\\s*(#.*)?$`).test(l))
  if (header < 0) {
    const body = text.endsWith('\n') || text === '' ? text : text + '\n'
    return `${body}${body ? '\n' : ''}[${section}]\n${line}\n`
  }
  let end = lines.length
  for (let i = header + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i]!)) {
      end = i
      break
    }
  }
  const active = new RegExp(`^\\s*${esc(key)}\\s*=`)
  const example = new RegExp(`^\\s*#\\s*${esc(key)}\\s*=`)
  for (let i = header + 1; i < end; i++) {
    if (active.test(lines[i]!)) {
      lines[i] = lines[i]!.endsWith('\r') ? line + '\r' : line
      return lines.join('\n')
    }
  }
  let at = header + 1
  for (let i = header + 1; i < end; i++) {
    if (example.test(lines[i]!)) {
      at = i + 1
      break
    }
  }
  lines.splice(at, 0, lines[header]!.endsWith('\r') ? line + '\r' : line)
  return lines.join('\n')
}
