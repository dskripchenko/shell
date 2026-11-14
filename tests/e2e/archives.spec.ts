import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.skip(process.platform === 'win32', 'driven with bash; the archive made by tar')

test('an archive as a folder in the file panels: entered, a folder in it, a file copied out, read only', async () => {
  const work = mkdtempSync(join(tmpdir(), 'shell-arc-'))
  const src = join(work, 'src')
  mkdirSync(join(src, 'pkg', 'lib'), { recursive: true })
  writeFileSync(join(src, 'pkg', 'lib', 'util.js'), 'export const util = 1\n')
  writeFileSync(join(src, 'pkg', 'README.md'), '# Package\n')
  execFileSync('tar', ['-czf', join(work, 'pkg.tgz'), '-C', src, 'pkg'])
  mkdirSync(join(work, 'out'))
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: work } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  await expect(page.locator('.tab.active .tab-name')).toHaveText(work.split('/').pop()!, { timeout: 20_000 })

  await page.keyboard.press('Control+o')
  const cmd = page.locator('.commander')
  const left = cmd.locator('.fpanel').first()
  const right = cmd.locator('.fpanel').nth(1)
  // The right panel in out/.
  await page.keyboard.press('Tab')
  await right.locator('.fpanel-row', { hasText: 'out/' }).click()
  await page.keyboard.press('Enter')
  await expect(right.locator('.fpanel-head')).toContainText('out')
  await page.keyboard.press('Tab')

  // Into the archive, and a folder in it.
  await left.locator('.fpanel-row', { hasText: 'pkg.tgz' }).click()
  await page.keyboard.press('Enter')
  await expect(left.locator('.fpanel-head')).toContainText('pkg.tgz ›')
  await expect(left.locator('.fpanel-row')).toContainText(['..', 'pkg/'])
  await left.locator('.fpanel-row', { hasText: 'pkg/' }).click()
  await page.keyboard.press('Enter')
  await expect(left.locator('.fpanel-row')).toContainText(['..', 'lib/', 'README.md'])

  // Copied out with F5: the folder and what is in it.
  await left.locator('.fpanel-row', { hasText: 'lib/' }).click()
  await page.keyboard.press('F5')
  await page.keyboard.press('Enter')
  // Its content, not only its name (the file is made before it is written).
  const util = join(work, 'out', 'lib', 'util.js')
  await expect.poll(() => (existsSync(util) ? readFileSync(util, 'utf8') : '')).toBe('export const util = 1\n')

  // Nothing made in it.
  await page.keyboard.press('F7')
  await expect(page.locator('.status-message')).toContainText('только для чтения')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Up out of it: back beside the archive, the cursor on it.
  await left.locator('.fpanel-row', { hasText: '..' }).click()
  await page.keyboard.press('Enter')
  await left.locator('.fpanel-row', { hasText: '..' }).click()
  await page.keyboard.press('Enter')
  await expect(left.locator('.fpanel-row.cursor')).toContainText('pkg.tgz')
  await app.close()
})
