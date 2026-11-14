import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'driven with bash')

test('git on the tab: its branch and a mark for changes; a worktree made in a group of its own', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shell-home-')))
  const repo = join(home, 'app')
  mkdirSync(repo)
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd: repo, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a\n')
  git('add', '.')
  git('commit', '-qm', 'start')

  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), `[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n[profiles.app]\ncwd = "${repo}"\n`)
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  const palette = async (text: string) => {
    await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await palette('Новая вкладка: app')
  await expect(page.locator('.tab.active .tab-name')).toHaveText('app', { timeout: 20_000 })
  const mark = page.locator('.tab.active .tab-git')
  await expect(mark).toHaveText('main', { timeout: 15_000 })
  writeFileSync(join(repo, 'a.txt'), 'b\n')
  await expect(mark).toHaveText('main●', { timeout: 15_000 })
  await expect(mark).toHaveAttribute('title', /изменено файлов: 1/)

  // A worktree on a new branch, beside the repository, in a group named by it.
  await palette('Новый worktree')
  const dialog = page.getByRole('dialog', { name: 'Новый worktree' })
  await dialog.getByLabel('Ветка').fill('feature/x')
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.group-row.active .group-name')).toHaveText('feature/x')
  expect(existsSync(join(home, 'app-feature-x', 'a.txt'))).toBe(true)
  await expect(page.locator('.tab.active .tab-git')).toHaveText('feature/x', { timeout: 15_000 })

  // The same branch again: said, nothing made.
  await palette('Группа: Основная')
  await palette('Новый worktree')
  await dialog.getByLabel('Ветка').fill('feature/x')
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(dialog.getByRole('alert')).toContainText('уже есть')
  await app.close()
})
