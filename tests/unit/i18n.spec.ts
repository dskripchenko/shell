import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULTS, defaultText, parseConfig } from '../../src/common/config'
import { formatSize } from '../../src/common/commander'
import { LANGS, messagesOf, resolveLang, setLang } from '../../src/common/i18n'
import { BUILT_IN, themeNamed } from '../../src/common/themes'

afterEach(() => setLang('ru'))

/** What a sentence takes where a count or a name would not do. */
const ARGS: Record<string, unknown[]> = {
  'say.copied': ['command'],
  'say.broadcastOn': ['tab'],
  'status.broadcast': ['group'],
  'config.expected': ['font', 'size', 'number'],
  'files.items': [['a.txt', 'b.txt']],
  'files.deleteLocal': ['x', true],
}

/** Every word of a dictionary: strings as they are, functions called with something of the right kind. */
function words(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]]
  if (typeof v === 'function') {
    const args = ARGS[path] ?? Array.from({ length: v.length }, (_, i) => (i === 0 ? 2 : 'x'))
    const out = (v as (...a: unknown[]) => unknown)(...args)
    return [[path, typeof out === 'string' ? out : JSON.stringify(out)]]
  }
  if (Array.isArray(v)) return v.flatMap((x, i) => words(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => words(x, path ? `${path}.${k}` : k))
  return []
}

describe('languages', () => {
  it('the setting, else the system’s locale, else English', () => {
    expect(resolveLang('de', 'ru-RU')).toBe('de')
    expect(resolveLang('auto', 'ru-RU')).toBe('ru')
    expect(resolveLang('auto', 'zh_CN')).toBe('zh')
    expect(resolveLang('auto', 'fr-FR')).toBe('en')
    expect(resolveLang('klingon', 'de')).toBe('de')
  })

  it('every language has every word, none empty, none saying undefined', () => {
    const en = words(messagesOf('en')).map(([p]) => p)
    for (const lang of LANGS) {
      const all = words(messagesOf(lang))
      expect(all.map(([p]) => p)).toEqual(en)
      for (const [p, w] of all) {
        expect(w, `${lang}: ${p}`).not.toBe('')
        expect(w, `${lang}: ${p}`).not.toMatch(/undefined|\[object/)
      }
    }
  })

  it('config.toml written at the first start reads as the defaults in every language', () => {
    for (const lang of LANGS) {
      setLang(lang)
      const r = parseConfig(defaultText(lang))
      expect(r.errors, lang).toEqual([])
      expect(r.config).toEqual(DEFAULTS)
    }
    expect(defaultText('de')).toContain('# Einstellungen von shell')
    expect(defaultText('zh')).toContain('# shell 的设置')
  })

  it('a mistake in the config is said in the language in use', () => {
    setLang('en')
    expect(parseConfig('[font]\nsize = "big"').errors).toEqual(['[font] size: a number is expected'])
    setLang('de')
    expect(parseConfig('[font]\nsize = "big"').errors).toEqual(['[font] size: eine Zahl wird erwartet'])
  })

  it('sizes in the language’s units and decimal mark', () => {
    setLang('en')
    expect(formatSize(1536)).toBe('1.5 KB')
    setLang('ru')
    expect(formatSize(1536)).toBe('1,5 КБ')
  })

  it('the built-in themes found by their former Russian names too', () => {
    expect(themeNamed(BUILT_IN, 'UID светлая')?.name).toBe('UID Light')
    expect(themeNamed(BUILT_IN, 'UID Dark')?.name).toBe('UID Dark')
  })
})
