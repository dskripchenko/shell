/**
 * The settings as they are on disk: `config.toml` and the themes folder,
 * read again a moment after either changes, and told to the windows.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { defaultText, FIELDS, parseConfig, setConfigValue } from '../common/config'
import { lang, msg, resolveLang, setLang } from '../common/i18n'
import { writeAtomic } from './session'
import type { Settings } from '../common/ipc'
import { importThemes, type Theme } from '../common/themes'

export class SettingsStore {
  readonly configFile: string
  readonly themesDir: string
  private current: Settings
  private watchers: FSWatcher[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly dir: string,
    private readonly onChange: (s: Settings) => void,
    /** The system's locale (`ru-RU`): the language when the config says "auto". */
    private readonly locale = 'en',
  ) {
    this.configFile = join(dir, 'config.toml')
    this.themesDir = join(dir, 'themes')
    mkdirSync(this.themesDir, { recursive: true })
    // The first file: its comments in the system's language.
    if (!existsSync(this.configFile)) writeFileSync(this.configFile, defaultText(resolveLang('auto', locale)))
    this.current = this.read()
  }

  get(): Settings {
    return this.current
  }

  watch(): void {
    const later = () => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.current = this.read()
        this.onChange(this.current)
      }, 150)
    }
    try {
      // The folder, not the file: editors save by writing a new file in its place.
      this.watchers.push(watch(this.dir, (_e, name) => name === 'config.toml' && later()))
      this.watchers.push(watch(this.themesDir, later))
    } catch {
      // No watching on this system: settings apply at the next start.
    }
  }

  /** One setting written into the file, checked as the file would be read; read again at once. */
  set(section: string, key: string, value: unknown): { ok: true } | { error: string } {
    const f = FIELDS[section]?.[key]
    if (!f) return { error: msg().main.noSettingKey(section, key) }
    const ok =
      f.kind === 'strings' ? Array.isArray(value) && value.every((v) => typeof v === 'string') : typeof value === f.kind && (f.kind !== 'number' || Number.isFinite(value))
    if (!ok) return { error: msg().main.badValue(section, key) }
    let text: string
    try {
      text = readFileSync(this.configFile, 'utf8')
    } catch {
      text = defaultText(lang())
    }
    const next = setConfigValue(text, section, key, value as string | number | boolean | string[])
    const errors = parseConfig(next).errors.filter((e) => e.startsWith(`[${section}] ${key}`))
    if (errors.length) return { error: errors[0]! }
    writeAtomic(this.configFile, next)
    this.current = this.read()
    this.onChange(this.current)
    return { ok: true }
  }

  close(): void {
    for (const w of this.watchers) w.close()
    this.watchers = []
  }

  private read(): Settings {
    let text: string
    try {
      text = readFileSync(this.configFile, 'utf8')
    } catch {
      text = ''
    }
    // The language first (the config says it), then the config read again so its mistakes are said in it.
    let result = parseConfig(text)
    const language = resolveLang(result.config.ui.language, this.locale)
    if (language !== lang()) {
      setLang(language)
      result = parseConfig(text)
    }
    const themes: Theme[] = []
    const themeErrors: string[] = []
    let names: string[]
    try {
      names = readdirSync(this.themesDir).filter((n) => !n.startsWith('.')).sort()
    } catch {
      names = []
    }
    for (const name of names) {
      try {
        const found = importThemes(name, readFileSync(join(this.themesDir, name), 'utf8'))
        if (found.length === 0) themeErrors.push(msg().main.notTheme(name))
        themes.push(...found)
      } catch (e) {
        themeErrors.push(`themes/${name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return { ...result, themes, themeErrors, dataDir: this.dir, lang: language }
  }
}
