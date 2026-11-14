import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataFolder, launch } from './app'

test('the interface in the language the config says, changed in the settings at once — the menu, the palette, the commands', async () => {
  const data = dataFolder('[ui]\nlanguage = "en"\n')
  const { app, page } = await launch(data)
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

  await expect(page.locator('.titlebar .chip')).toContainText('Commands')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('combobox')).toHaveAttribute('placeholder', 'Command, group or tab — in any keyboard layout')
  await expect(palette.locator('.palette-item', { hasText: 'New tab' }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // German, from the settings: the window says it at once, the file keeps it.
  await page.keyboard.press(`${mod}+Comma`)
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByLabel('Language').selectOption('de')
  await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible()
  await expect(page.locator('.titlebar .chip')).toContainText('Befehle')
  await expect.poll(() => readFileSync(join(data, 'config.toml'), 'utf8')).toMatch(/\[ui\][\s\S]*language = "de"/)
  await page.getByRole('dialog', { name: 'Einstellungen' }).getByRole('button', { name: 'Fertig' }).click()

  // The palette's commands in it.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p')
  await expect(page.getByRole('dialog', { name: 'Befehlspalette' }).locator('.palette-item', { hasText: 'Neuer Tab' }).first()).toBeVisible()
  await app.close()
})
