/**
 * The words in the window: `m()` reads the language through the store, so a
 * template that uses it is drawn again when the language changes.
 */
import { msg, setLang, type Lang, type Messages } from '../common/i18n'
import { ui } from './store'

export function m(): Messages {
  void ui.lang
  return msg()
}

export function useLang(lang: Lang): void {
  setLang(lang)
  ui.lang = lang
  document.documentElement.lang = lang
}
