import { expect, test } from '@playwright/test'
import { dataFolder, launch, MOD, screen, type } from './app'

// Arithmetic the shell does, so the output is not the typed text: POSIX sh, or PowerShell on Windows.
const SUM = process.platform === 'win32' ? 'echo "hello-$(40+2)"' : 'echo hello-$((40+2))'

test('a shell runs; panes split and close; tabs and groups; the palette in any layout; all of it back after a restart', async () => {
  const data = dataFolder()
  let { app, page } = await launch(data)

  // A command and its output.
  await type(page, SUM)
  // The first start of a shell can be slow (PowerShell on a CI runner).
  await expect.poll(() => screen(page), { timeout: 30_000 }).toContain('hello-42')

  // Split right, then down: three panes, the newest focused.
  await page.keyboard.press(`${MOD}+d`)
  await expect(page.locator('.pane')).toHaveCount(2)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+d' : 'Control+Shift+e')
  await expect(page.locator('.pane')).toHaveCount(3)
  await expect(page.locator('.pane.dimmed')).toHaveCount(2)
  await type(page, 'echo in-the-third')
  await expect.poll(() => screen(page), { timeout: 30_000 }).toContain('in-the-third')

  // Closing a pane gives its room back.
  await page.keyboard.press(`${MOD}+w`)
  await expect(page.locator('.pane')).toHaveCount(2)

  // A new tab; the first one again by its number.
  await page.keyboard.press(`${MOD}+t`)
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect(page.locator('.pane')).toHaveCount(1)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+1' : 'Alt+1')
  await expect(page.locator('.pane')).toHaveCount(2)

  // The palette: a query typed in the other layout still finds the command («разд» on a QWERTY keyboard is «hfpl»).
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p')
  await expect(page.locator('.palette')).toBeVisible()
  await page.keyboard.type('hfpltkbnm dghfdj')
  await expect(page.locator('.palette-item').first()).toContainText('Разделить вправо')
  await page.keyboard.press('Escape')
  await expect(page.locator('.palette')).toHaveCount(0)

  // A tab named and coloured.
  await page.locator('.tab.active').dblclick()
  await page.locator('#name-field').fill('сервер')
  await page.locator('.color').nth(2).click()
  await page.locator('.dialog button[type=submit]').click()
  await expect(page.locator('.tab.active .tab-name')).toHaveText('сервер')

  // A second group; the sidebar folded to its rail and opened again.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+n' : 'Control+Shift+n')
  await page.locator('#name-field').fill('другая')
  await page.keyboard.press('Enter')
  await expect(page.locator('.group-row')).toHaveCount(2)
  await page.keyboard.press(`${MOD}+b`)
  await expect(page.locator('.rail-tile')).toHaveCount(2)
  await page.keyboard.press(`${MOD}+b`)
  await expect(page.locator('.group-row.active')).toContainText('другая')

  // Back to the first group, and a restart.
  await page.locator('.group-row').first().click()
  await page.waitForTimeout(600) // the workspace is saved a moment after its last change
  await app.close()
  ;({ app, page } = await launch(data))
  await expect(page.locator('.group-row')).toHaveCount(2)
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect(page.locator('.tab-name').first()).toHaveText('сервер')
  await expect(page.locator('.pane')).toHaveCount(2)
  // The output from before the restart, set apart, in the pane it was in.
  const all = () => page.evaluate(() => document.body.innerText)
  await expect.poll(all).toContain('вывод до перезапуска')
  await expect.poll(all).toContain('hello-42')
  await app.close()
})

test('a mistake in config.toml is said in the status bar; the rest applies', async () => {
  const data = dataFolder('[font]\nsize = "big"\n')
  const { app, page } = await launch(data)
  await expect(page.locator('.status-problem')).toContainText('[font] size: ожидается число')
  await app.close()
})
