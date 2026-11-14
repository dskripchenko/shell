/**
 * The settings as they are on disk: `config.toml` and the themes folder,
 * read again a moment after either changes, and told to the windows.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_TEXT, parseConfig } from '../common/config'
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
  ) {
    this.configFile = join(dir, 'config.toml')
    this.themesDir = join(dir, 'themes')
    mkdirSync(this.themesDir, { recursive: true })
    if (!existsSync(this.configFile)) writeFileSync(this.configFile, DEFAULT_TEXT)
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
    const result = parseConfig(text)
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
        if (found.length === 0) themeErrors.push(`themes/${name}: не тема iTerm2, Ghostty, Windows Terminal или base16`)
        themes.push(...found)
      } catch (e) {
        themeErrors.push(`themes/${name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return { ...result, themes, themeErrors, dataDir: this.dir }
  }
}
