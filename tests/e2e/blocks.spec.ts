import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, type } from './app'

test.skip(process.platform === 'win32', 'driven with bash')

test('a command as a block: its mark or a right click — the command and its output copied, the command run again', async () => {
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const { app, page } = await launch(data)
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  const clipboard = () => app.evaluate(({ clipboard }) => clipboard.readText())
  await type(page, "printf 'one\\ntwo\\n'")
  await expect.poll(text).toMatch(/^two/m)

  // Right click in its output: the block's menu.
  await page.locator('.pane.focused .dsk-term-row', { hasText: /^two/ }).click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toContainText("printf 'one\\ntwo\\n'")
  await menu.getByRole('menuitem', { name: 'Копировать вывод' }).click()
  await expect.poll(clipboard).toBe('one\ntwo')

  // Its mark: the same menu; as Markdown.
  await page.locator('.pane.focused .dsk-term-mark').first().click()
  await menu.getByRole('menuitem', { name: 'Копировать как Markdown' }).click()
  await expect.poll(clipboard).toBe("```console\n$ printf 'one\\ntwo\\n'\none\ntwo\n```")

  // Again: run once more.
  await page.locator('.pane.focused .dsk-term-mark').first().click()
  await menu.getByRole('menuitem', { name: 'Повторить команду' }).click()
  await expect.poll(async () => (await text()).split(/^two$/m).length - 1).toBe(2)
  await app.close()
})
