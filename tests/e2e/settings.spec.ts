import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataFolder, launch } from './app'

test('settings with fields: each change written into config.toml, the file’s comments kept, applied at once; a wrong value said', async () => {
  const data = dataFolder('[font]\n# my own note\nfamily = "Menlo"\n')
  const { app, page } = await launch(data)
  const file = () => readFileSync(join(data, 'config.toml'), 'utf8')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma')
  const dialog = page.getByRole('dialog', { name: 'Настройки' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Размер').fill('15')
  await dialog.getByLabel('Размер').press('Tab')
  await expect.poll(file).toContain('size = 15')
  expect(file()).toContain('# my own note\nfamily = "Menlo"')
  // Applied: the panes' font is the new size.
  await expect.poll(() => page.locator('.pane.focused .dsk-term').evaluate((e) => getComputedStyle(e).fontSize)).toBe('15px')

  await dialog.getByText('Возвращать вывод вкладок после перезапуска').click()
  await expect.poll(file).toMatch(/\[scrollback\][\s\S]*restore = false/)

  // Out of range: said, not written.
  await dialog.getByLabel('Размер').fill('200')
  await dialog.getByLabel('Размер').press('Tab')
  await expect(dialog.getByRole('alert')).toContainText('size')
  expect(file()).not.toContain('size = 200')

  await dialog.getByRole('button', { name: 'Готово' }).click()
  await expect(dialog).toBeHidden()
  await app.close()
})
