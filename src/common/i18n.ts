/**
 * The interface's language: English, Russian, German or Chinese — the
 * config's `[ui] language`, or the system's ("auto"). The main process and
 * the window each set it (`setLang`) and read the words through `msg()`.
 */
import { de } from '../locales/de'
import { en, type Messages } from '../locales/en'
import { ru } from '../locales/ru'
import { zh } from '../locales/zh'

export type Lang = 'en' | 'ru' | 'de' | 'zh'
export const LANGS: Lang[] = ['en', 'ru', 'de', 'zh']
const DICTS: Record<Lang, Messages> = { en, ru, de, zh }

export type { Messages }

/** The language for a setting: one named, or the system's locale (`ru-RU` → ru); English when neither is known. */
export function resolveLang(setting: string, systemLocale: string): Lang {
  if ((LANGS as string[]).includes(setting)) return setting as Lang
  const base = systemLocale.toLowerCase().split(/[-_]/)[0] ?? ''
  return (LANGS as string[]).includes(base) ? (base as Lang) : 'en'
}

let current: Lang = 'en'

export function setLang(lang: Lang): void {
  current = lang
}

export function lang(): Lang {
  return current
}

/** The words of the language in use. */
export function msg(): Messages {
  return DICTS[current]
}

/** A language's words, whichever is in use. */
export function messagesOf(lang: Lang): Messages {
  return DICTS[lang]
}
