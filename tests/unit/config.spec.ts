import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT, DEFAULTS, parseConfig, setConfigValue } from '../../src/common/config'

describe('config.toml', () => {
  it('the file written at first start reads as the defaults, with no mistakes', () => {
    expect(parseConfig(DEFAULT_TEXT)).toEqual({ config: DEFAULTS, errors: [] })
  })

  it('settings given take their place', () => {
    const { config, errors } = parseConfig('[font]\nsize = 15\nline-height = 1.5\n[theme]\nname = "Tomorrow Night"\n[shell]\nprogram = "/bin/bash"\nargs = ["-l"]\n[keys]\n"cmd+k" = "palette.open"\n')
    expect(errors).toEqual([])
    expect(config.font).toMatchObject({ size: 15, lineHeight: 1.5 })
    expect(config.theme.name).toBe('Tomorrow Night')
    expect(config.shell).toEqual({ program: '/bin/bash', args: ['-l'] })
    expect(config.keys).toEqual({ 'cmd+k': 'palette.open' })
  })

  it('a mistake keeps the default and is said; the rest still applies', () => {
    const { config, errors } = parseConfig('[font]\nsize = "big"\nfamily = "Menlo"\n[window]\ndim-inactive = 0.1\n[colors]\nx = 1\n[quake]\nhieght = 0.5\n')
    expect(config.font.size).toBe(DEFAULTS.font.size)
    expect(config.font.family).toBe('Menlo')
    expect(config.window.dimInactive).toBe(DEFAULTS.window.dimInactive)
    expect(errors).toEqual(['[font] size: ожидается число', '[window] dim-inactive: от 0.5 до 1', 'неизвестный раздел [colors]', '[quake] неизвестная настройка «hieght»'])
  })

  it('a file that is not TOML: the defaults, and why', () => {
    const { config, errors } = parseConfig('[font\nsize = ')
    expect(config).toEqual(DEFAULTS)
    expect(errors[0]).toMatch(/^config.toml не прочитан/)
  })
})

describe('profiles and updates', () => {
  it('profiles read by name; a mistake in one keeps the rest of it', () => {
    const { config, errors } = parseConfig('[updates]\nauto = false\n[profiles.python]\nprogram = "/bin/zsh"\nargs = ["-l"]\nenv = { A = "1" }\ncwd = "~/p"\ntheme = "UID светлая"\n[profiles.bad]\nprogram = 5\ncolour = "x"\nenv = { B = 2 }\n')
    expect(config.updates.auto).toBe(false)
    expect(config.profiles.python).toEqual({ program: '/bin/zsh', args: ['-l'], env: { A: '1' }, cwd: '~/p', theme: 'UID светлая' })
    expect(config.profiles.bad).toEqual({})
    expect(errors).toEqual(['[profiles.bad] program: ожидается строка', '[profiles.bad] неизвестная настройка «colour»', '[profiles.bad] env: ожидается таблица строк'])
  })
})

describe('a setting written into the text', () => {
  it('replaces its line, or goes under its example, or under the section, or into a new one — the rest kept', () => {
    const text = '# mine\n[font]\n# size = 13\nfamily = "Mono" # my font\n\n[quake]\nenabled = true\n'
    expect(setConfigValue(text, 'font', 'family', 'Plex')).toBe('# mine\n[font]\n# size = 13\nfamily = "Plex"\n\n[quake]\nenabled = true\n')
    expect(setConfigValue(text, 'font', 'size', 15)).toBe('# mine\n[font]\n# size = 13\nsize = 15\nfamily = "Mono" # my font\n\n[quake]\nenabled = true\n')
    expect(setConfigValue(text, 'quake', 'height', 0.5)).toBe('# mine\n[font]\n# size = 13\nfamily = "Mono" # my font\n\n[quake]\nheight = 0.5\nenabled = true\n')
    expect(setConfigValue(text, 'agents', 'commands', ['claude', 'a "b"'])).toBe(text + '\n[agents]\ncommands = ["claude", "a \\"b\\""]\n')
    expect(setConfigValue('[font]\r\nsize = 13\r\n', 'font', 'size', 14)).toBe('[font]\r\nsize = 14\r\n')
    // On the file written at the first start: read back as set, nothing else changed.
    let t = DEFAULT_TEXT
    t = setConfigValue(t, 'font', 'size', 15)
    t = setConfigValue(t, 'security', 'secure-keyboard', true)
    t = setConfigValue(t, 'quake', 'hotkey', 'ctrl+`')
    const r = parseConfig(t)
    expect(r.errors).toEqual([])
    expect(r.config.font.size).toBe(15)
    expect(r.config.security.secureKeyboard).toBe(true)
    expect(r.config.quake.hotkey).toBe('ctrl+`')
    expect(t.split('\n').length).toBe(DEFAULT_TEXT.split('\n').length + 3)
  })
})
