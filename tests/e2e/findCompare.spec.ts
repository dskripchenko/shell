import { _electron as electron, expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.skip(process.platform === 'win32', 'driven with bash')

test('the file panels: files found by a mask and a text, gone to; two folders compared', async () => {
  const work = mkdtempSync(join(tmpdir(), 'shell-findcmp-'))
  mkdirSync(join(work, 'a', 'deep'), { recursive: true })
  mkdirSync(join(work, 'b'))
  writeFileSync(join(work, 'a', 'deep', 'target.ts'), 'const x = 1\n// the needle\n')
  writeFileSync(join(work, 'a', 'other.ts'), 'nothing here\n')
  // a and b: same.txt alike, changed.txt bigger in a, only-a.txt and only-b.txt each on one side.
  for (const d of ['a', 'b']) {
    writeFileSync(join(work, d, 'same.txt'), 'same\n')
    utimesSync(join(work, d, 'same.txt'), 1_700_000_000, 1_700_000_000)
  }
  writeFileSync(join(work, 'a', 'changed.txt'), 'longer text\n')
  writeFileSync(join(work, 'b', 'changed.txt'), 'short\n')
  writeFileSync(join(work, 'a', 'only-a.txt'), '1\n')
  writeFileSync(join(work, 'b', 'only-b.txt'), '1\n')
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

  // Alt+F7: *.ts with "needle" — one file, two levels down; Enter goes to it.
  await page.keyboard.press('Alt+F7')
  const find = page.getByRole('dialog', { name: 'Поиск файлов' })
  await find.getByLabel('Имя (маска)').fill('*.ts')
  await find.getByLabel('Текст внутри').fill('needle')
  await find.getByRole('button', { name: 'Найти' }).click()
  await expect(find.locator('.palette-item')).toHaveCount(1)
  await expect(find.locator('.palette-item')).toContainText('строка 2')
  await page.keyboard.press('Enter')
  await expect(find).toHaveCount(0)
  await expect(left.locator('.fpanel-head')).toContainText('deep')
  await expect(left.locator('.fpanel-row.cursor')).toContainText('target.ts')

  // Left in a, right in b; compared: the differing files marked on each side.
  await left.locator('.fpanel-row', { hasText: '..' }).click()
  await page.keyboard.press('Enter')
  await expect(left.locator('.fpanel-row.cursor')).toContainText('deep/')
  await page.keyboard.press('Tab')
  await right.locator('.fpanel-row', { hasText: 'b/' }).click()
  await page.keyboard.press('Enter')
  await expect(right.locator('.fpanel-head')).toContainText('/b')
  await page.keyboard.press('Control+x')
  await page.keyboard.press('d')
  await expect(left.locator('.fpanel-row.marked')).toHaveText([/changed\.txt/, /only-a\.txt/, /other\.ts/])
  await expect(right.locator('.fpanel-row.marked')).toHaveText([/changed\.txt/, /only-b\.txt/])
  await app.close()
})
