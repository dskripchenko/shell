import { BUILT_IN, UID_DARK, UID_LIGHT, type Theme } from '../common/themes'
import { ui } from './store'

/** The theme in force: by name, or the system's light or dark one. */
export function currentTheme(): Theme {
  const s = ui.settings
  if (!s) return ui.systemDark ? UID_DARK : UID_LIGHT
  const all = [...BUILT_IN, ...s.themes]
  const want = s.config.theme.name === 'system' ? (ui.systemDark ? s.config.theme.dark : s.config.theme.light) : s.config.theme.name
  return all.find((t) => t.name === want) ?? (ui.systemDark ? UID_DARK : UID_LIGHT)
}

export function allThemes(): Theme[] {
  return [...BUILT_IN, ...(ui.settings?.themes ?? [])]
}

/** The window's chrome follows the terminal's theme: light or dark, and the panes' ground. */
export function applyChrome(theme: Theme): void {
  const root = document.documentElement
  root.dataset.theme = theme.kind
  root.style.setProperty('--term-bg', theme.background)
  root.style.setProperty('--term-fg', theme.foreground)
}
