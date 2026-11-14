import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataFolder, launch, type } from './app'

test.skip(process.platform === 'win32', 'driven with sh')

test('a prompt from the library: its places filled in, pasted into the pane without Enter', async () => {
  // bash: its folder said at once (OSC 7), for {cwd}.
  const data = dataFolder()
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  mkdirSync(join(data, 'prompts'))
  writeFileSync(join(data, 'prompts', 'Where.md'), 'echo "in {cwd}: {selection}"\n')
  const { app, page } = await launch(data)
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  await type(page, 'cd /tmp && echo picked-word')
  await expect.poll(text).toContain('picked-word')
  // A word selected in the output becomes {selection}.
  await page.locator('.pane.focused .dsk-term-row', { hasText: /^picked-word/ }).last().dblclick({ position: { x: 12, y: 6 } })
  await expect.poll(() => page.evaluate(() => (window as unknown as { shellTest: { selection(): string } }).shellTest.selection())).toBe('picked-word')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+l' : 'Control+Shift+l')
  const palette = page.getByRole('dialog', { name: 'Промпты' })
  await expect(palette.locator('.palette-item', { hasText: 'Where' })).toBeVisible()
  // The examples a library starts with are not written over an existing one.
  await expect(palette.locator('.palette-item', { hasText: 'Ревью изменений' })).toHaveCount(0)
  await page.keyboard.type('where')
  await page.keyboard.press('Enter')
  // Not run: pasted, waiting for Enter.
  await page.waitForTimeout(300)
  expect(await text()).not.toMatch(/^in \/.*picked/m)
  await page.keyboard.press('Enter')
  await expect.poll(text).toMatch(/in \/(private\/)?tmp: picked/)
  await app.close()
})
