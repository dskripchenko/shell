import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.skip(process.platform === 'win32', 'driven with bash; PowerShell takes the same path in the app')

test('file panels on Ctrl+O: a new folder, a copy to the other panel, to the trash, and the shell follows on closing', async () => {
  const work = mkdtempSync(join(tmpdir(), 'shell-files-'))
  mkdirSync(join(work, 'sub'))
  writeFileSync(join(work, 'a.txt'), 'hello from a\n')
  writeFileSync(join(work, 'b.txt'), 'bye\n')
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: work } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  // The shell said its folder: it waits at its prompt.
  await expect(page.locator('.tab.active .tab-name')).toHaveText(work.split('/').pop()!, { timeout: 20_000 })

  await page.keyboard.press('Control+o')
  const cmd = page.locator('.commander')
  await expect(cmd).toBeVisible()
  const leftPanel = cmd.locator('.fpanel').first()
  const rightPanel = cmd.locator('.fpanel').nth(1)
  await expect(leftPanel.locator('.fpanel-row')).toContainText(['..', 'sub/', 'a.txt', 'b.txt'])

  // F7: a new folder, the cursor on it.
  await page.keyboard.press('F7')
  await page.keyboard.type('made')
  await page.keyboard.press('Enter')
  await expect(leftPanel.locator('.fpanel-row.cursor')).toContainText('made/')
  expect(existsSync(join(work, 'made'))).toBe(true)

  // The right panel into sub; back left, a.txt copied there with F5.
  await page.keyboard.press('Tab')
  await rightPanel.locator('.fpanel-row', { hasText: 'sub/' }).click()
  await page.keyboard.press('Enter')
  await expect(rightPanel.locator('.fpanel-head')).toContainText('sub')
  await page.keyboard.press('Tab')
  await leftPanel.locator('.fpanel-row', { hasText: 'a.txt' }).click()
  await page.keyboard.press('F3')
  await expect(cmd.locator('.quick-text')).toContainText('hello from a')
  await page.keyboard.press('F3')
  await page.keyboard.press('F5')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(work, 'sub', 'a.txt'))).toBe(true)

  // F8: b.txt to the trash (no trash on a headless Linux runner).
  if (process.platform === 'darwin') {
    await leftPanel.locator('.fpanel-row', { hasText: 'b.txt' }).click()
    await page.keyboard.press('F8')
    await page.keyboard.press('Enter')
    await expect.poll(() => existsSync(join(work, 'b.txt'))).toBe(false)
  }

  // Into made, and closed: the shell goes there.
  await leftPanel.locator('.fpanel-row', { hasText: 'made/' }).click()
  await page.keyboard.press('Enter')
  await expect(leftPanel.locator('.fpanel-head')).toContainText('made')
  await page.keyboard.press('Escape')
  await expect(cmd).toHaveCount(0)
  await expect(page.locator('.tab.active .tab-name')).toHaveText('made', { timeout: 10_000 })
  await app.close()
})
