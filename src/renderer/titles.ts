import type { Tab } from '../common/layout'
import { baseName, ui } from './store'
import { paneCwd } from './terminals'

/** A tab's name: the one given by hand, else what its focused program says, else its folder. */
export function tabTitle(tab: Tab): string {
  if (tab.name) return tab.name
  const title = ui.titles[tab.focus]?.trim()
  if (title) return title
  const cwd = paneCwd(tab.focus)
  return cwd ? baseName(cwd) || '/' : 'shell'
}

/** A group's short mark for the collapsed sidebar: two letters of its name. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s·._\-/]+/).filter(Boolean)
  if (words.length === 0) return '·'
  if (words.length === 1) return words[0]!.slice(0, 2).toLowerCase()
  return (words[0]![0]! + words[1]![0]!).toLowerCase()
}
