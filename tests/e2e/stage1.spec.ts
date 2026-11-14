import { expect, test } from '@playwright/test'
import { dataFolder, launch, MOD, screen, type } from './app'

const win = process.platform === 'win32'
const mac = process.platform === 'darwin'

test('a tab with a profile: its program and its environment', async () => {
  const program = win ? 'program = "powershell.exe"\nargs = ["-NoLogo"]\n' : 'program = "/bin/sh"\n'
  const data = dataFolder(`[profiles.marked]\n${program}env = { SHELL_PROFILE_MARK = "from-the-profile" }\n`)
  const { app, page } = await launch(data)
  await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
  await page.keyboard.type('Новая вкладка: marked')
  await expect(page.locator('.palette-item').first()).toContainText('marked')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab')).toHaveCount(2)
  await type(page, win ? 'echo "[$env:SHELL_PROFILE_MARK]"' : 'echo "[$SHELL_PROFILE_MARK]"')
  await expect.poll(() => screen(page), { timeout: 30_000 }).toContain('[from-the-profile]')
  await app.close()
})

test('the drop-down window: shown on its key, with a terminal of its own', async () => {
  const { app, page } = await launch(dataFolder())
  // No global key can be pressed from a test: the call the key makes.
  await app.evaluate(() => (globalThis as unknown as { shellToggleQuake(): void }).shellToggleQuake())
  await expect.poll(() => app.windows().length).toBe(2)
  const quake = app.windows().find((w) => w !== page)!
  await quake.waitForSelector('.app.quake .term-host .dsk-term')
  await expect(quake.locator('.sidebar, .rail')).toHaveCount(0)
  await app.close()
})

test('a tab dragged onto another group moves there', async () => {
  const { app, page } = await launch(dataFolder())
  await page.keyboard.press(`${MOD}+t`)
  await expect(page.locator('.tab')).toHaveCount(2)
  await page.keyboard.press(mac ? 'Meta+Shift+n' : 'Control+Shift+n')
  await page.locator('#name-field').fill('вторая')
  await page.keyboard.press('Enter')
  await page.locator('.group-row').first().click()
  await expect(page.locator('.tab')).toHaveCount(2)
  await page.locator('.tab').nth(1).dragTo(page.locator('.group-row').nth(1))
  await expect(page.locator('.group-row.active')).toContainText('вторая')
  await expect(page.locator('.tab')).toHaveCount(2)
  await page.locator('.group-row').first().click()
  await expect(page.locator('.tab')).toHaveCount(1)
  await app.close()
})
