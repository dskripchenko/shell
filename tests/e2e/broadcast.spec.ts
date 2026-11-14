import { expect, test } from '@playwright/test'
import { dataFolder, launch, MOD, type } from './app'

test.skip(process.platform === 'win32', 'driven with sh')

test('input to every pane of the tab: typed once, run in each; not in another tab; off again', async () => {
  const { app, page } = await launch(dataFolder())
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  const count = async (s: string) => (await text()).split(s).length - 1
  const palette = async (t: string) => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p')
    await page.keyboard.type(t)
    await page.keyboard.press('Enter')
  }
  // Another tab, then two panes in this one.
  await page.keyboard.press(`${MOD}+t`)
  await expect(page.locator('.tab')).toHaveCount(2)
  await page.keyboard.press(`${MOD}+d`)
  await expect(page.locator('.pane')).toHaveCount(2)

  await palette('Ввод во все панели вкладки')
  await expect(page.locator('.pane.broadcast')).toHaveCount(2)
  await expect(page.locator('.status-broadcast')).toBeVisible()
  await type(page, 'echo bc-$((2+3))')
  await expect.poll(() => count('bc-5')).toBe(2)

  // Off: the focused pane only.
  await page.locator('.status-broadcast').click()
  await expect(page.locator('.pane.broadcast')).toHaveCount(0)
  await page.locator('.pane.focused .dsk-term').click()
  await type(page, 'echo solo-$((1+1))')
  await expect.poll(() => count('solo-2')).toBe(1)
  await app.close()
})
