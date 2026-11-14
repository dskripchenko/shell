/**
 * The settings: `config.toml` in the data folder, read again whenever it
 * changes. A mistake in it never stops the terminal — the setting keeps its
 * default and the mistake is said, by its place in the file.
 */
import { parse } from 'smol-toml'

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
  shell: { program: string; args: string[] }
  scrollback: { lines: number; restore: boolean; restoreKb: number }
  window: { dimInactive: number }
  quake: { enabled: boolean; hotkey: string; height: number }
  updates: { auto: boolean }
  /** Keys of the user's own: `"cmd+t" = "tab.new"`, `"cmd+k" = "none"`. */
  keys: Record<string, string>
  profiles: Record<string, Profile>
}

export const DEFAULTS: Config = {
  font: { family: "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace", size: 13, lineHeight: 1.3 },
  theme: { name: 'system', light: 'UID светлая', dark: 'UID тёмная' },
  shell: { program: '', args: [] },
  scrollback: { lines: 10000, restore: true, restoreKb: 512 },
  window: { dimInactive: 0.8 },
  quake: { enabled: true, hotkey: 'ctrl+`', height: 0.45 },
  updates: { auto: true },
  keys: {},
  profiles: {},
}

export const DEFAULT_TEXT = `# Настройки shell. Файл перечитывается при сохранении — перезапуск не нужен.
# Закомментированные строки показывают значения по умолчанию.

[font]
# family = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace"
# size = 13
# line-height = 1.3

[theme]
# "system" — светлая днём, тёмная вечером, как в системе; или имя темы.
# Свои темы — файлы в папке themes/ рядом с этим файлом:
# .itermcolors (iTerm2), темы Ghostty, .json (Windows Terminal), .yaml (base16).
# name = "system"
# light = "UID светлая"
# dark = "UID тёмная"

[shell]
# Пусто — оболочка пользователя ($SHELL; на Windows — PowerShell).
# program = ""
# args = []

[scrollback]
# lines = 10000
# Возвращать вывод вкладок после перезапуска.
# restore = true
# Сколько последнего вывода каждой панели хранить, в килобайтах.
# restore-kb = 512

[window]
# Яркость неактивных панелей, от 0.5 до 1.
# dim-inactive = 0.8

[quake]
# Выпадающее окно по глобальному хоткею.
# enabled = true
# hotkey = "ctrl+\`"
# Доля высоты экрана.
# height = 0.45

[updates]
# Раз в сутки при запуске проверять релизы на GitHub; обновление ставится при выходе.
# auto = true

[keys]
# Свои сочетания: команда на клавиши, "none" — снять.
# "cmd+k" = "palette.open"
# "ctrl+a>c" = "tab.new"

# Профили: как запускать оболочку. Профиль назначается группе (двойной щелчок
# по группе) или открывается из палитры: «Новая вкладка: имя».
# [profiles.python]
# program = "/bin/zsh"
# args = ["-l"]
# env = { VIRTUAL_ENV_DISABLE_PROMPT = "1" }
# cwd = "~/projects"
# theme = "UID светлая"
`

export interface ConfigResult {
  config: Config
  errors: string[]
}

type Kind = 'string' | 'number' | 'boolean' | 'strings'

const FIELDS: Record<string, Record<string, { key: string; kind: Kind; min?: number; max?: number }>> = {
  font: { family: { key: 'family', kind: 'string' }, size: { key: 'size', kind: 'number', min: 6, max: 72 }, 'line-height': { key: 'lineHeight', kind: 'number', min: 0.8, max: 3 } },
  theme: { name: { key: 'name', kind: 'string' }, light: { key: 'light', kind: 'string' }, dark: { key: 'dark', kind: 'string' } },
  shell: { program: { key: 'program', kind: 'string' }, args: { key: 'args', kind: 'strings' } },
  scrollback: { lines: { key: 'lines', kind: 'number', min: 0, max: 1_000_000 }, restore: { key: 'restore', kind: 'boolean' }, 'restore-kb': { key: 'restoreKb', kind: 'number', min: 0, max: 65536 } },
  window: { 'dim-inactive': { key: 'dimInactive', kind: 'number', min: 0.5, max: 1 } },
  quake: { enabled: { key: 'enabled', kind: 'boolean' }, hotkey: { key: 'hotkey', kind: 'string' }, height: { key: 'height', kind: 'number', min: 0.15, max: 1 } },
  updates: { auto: { key: 'auto', kind: 'boolean' } },
}

const PROFILE_FIELDS: Record<string, Kind | 'table'> = { program: 'string', args: 'strings', env: 'table', cwd: 'string', theme: 'string' }

function parseProfile(name: string, value: unknown, errors: string[]): Profile | null {
  if (!/^[\w.-]{1,40}$/.test(name)) {
    errors.push(`[profiles.${name}]: имя — буквы, цифры, «.», «_», «-»`)
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`[profiles.${name}]: ожидается таблица`)
    return null
  }
  const out: Profile = {}
  for (const [k, v] of Object.entries(value)) {
    const kind = PROFILE_FIELDS[k]
    if (!kind) {
      errors.push(`[profiles.${name}] неизвестная настройка «${k}»`)
      continue
    }
    if (kind === 'table') {
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.values(v).every((x) => typeof x === 'string')) {
        errors.push(`[profiles.${name}] ${k}: ожидается таблица строк`)
        continue
      }
      out.env = { ...(v as Record<string, string>) }
      continue
    }
    if (!fits(v, kind)) {
      errors.push(`[profiles.${name}] ${k}: ожидается ${kind === 'strings' ? 'список строк' : 'строка'}`)
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
    return { config, errors: [`config.toml не прочитан: ${message}`] }
  }
  for (const [section, value] of Object.entries(data)) {
    if (section === 'profiles') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [name, p] of Object.entries(value)) {
          const profile = parseProfile(name, p, errors)
          if (profile) config.profiles[name] = profile
        }
      } else errors.push('[profiles]: ожидается таблица')
      continue
    }
    if (section === 'keys') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
          if (typeof v === 'string') config.keys[k] = v
          else errors.push(`[keys] "${k}": ожидается имя команды строкой`)
        }
      } else errors.push('[keys]: ожидается таблица')
      continue
    }
    const fields = FIELDS[section]
    if (!fields || !value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`неизвестный раздел [${section}]`)
      continue
    }
    for (const [name, v] of Object.entries(value)) {
      const f = fields[name]
      if (!f) {
        errors.push(`[${section}] неизвестная настройка «${name}»`)
        continue
      }
      if (!fits(v, f.kind)) {
        errors.push(`[${section}] ${name}: ожидается ${{ string: 'строка', number: 'число', boolean: 'true или false', strings: 'список строк' }[f.kind]}`)
        continue
      }
      if (f.kind === 'number' && ((f.min !== undefined && (v as number) < f.min) || (f.max !== undefined && (v as number) > f.max))) {
        errors.push(`[${section}] ${name}: от ${f.min} до ${f.max}`)
        continue
      }
      ;(config as unknown as Record<string, Record<string, unknown>>)[section]![f.key] = v
    }
  }
  return { config, errors }
}
