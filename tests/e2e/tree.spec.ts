import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'driven with bash')

test('the project tree: the repository of the pane, folders opened, changed files marked, a file viewed, the pane taken to a folder', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shell-tree-')))
  const repo = join(home, 'app')
  mkdirSync(join(repo, 'src', 'lib'), { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd: repo, stdio: 'pipe' })
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, 'src', 'lib', 'b.ts'), 'export const b = 1\n')
  writeFileSync(join(repo, 'README.md'), '# App\n')
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'start')
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 2\n')
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), `[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n[profiles.app]\ncwd = "${repo}/src/lib"\n`)
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  const palette = async (t: string) => {
    await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
    await page.keyboard.type(t)
    await page.keyboard.press('Enter')
  }
  await palette('Новая вкладка: app')
  await expect(page.locator('.tab.active .tab-name')).toHaveText('lib', { timeout: 20_000 })

  await page.keyboard.press(mac ? 'Meta+Shift+e' : 'Control+Shift+x')
  const tree = page.locator('.project-tree')
  // The repository's root, not the pane's own folder.
  await expect(tree.locator('.changes-sub')).toContainText('app')
  await expect(tree.locator('.tree-row')).toHaveText(['src', 'README.md'])
  // A folder with a changed file in it says so; opened, the file too.
  await expect(tree.locator('.tree-row.changed')).toHaveText(['src'])
  await tree.locator('.tree-row', { hasText: 'src' }).click()
  await expect(tree.locator('.tree-row')).toHaveText(['src', 'lib', 'a.ts', 'README.md'])
  await expect(tree.locator('.tree-row.changed')).toHaveText(['src', 'a.ts'])

  // A file to the viewer.
  await tree.locator('.tree-row', { hasText: 'a.ts' }).dblclick()
  await expect(page.locator('.viewer .changes-title')).toHaveText('a.ts')
  await page.locator('.viewer').getByRole('button', { name: 'Закрыть просмотр' }).click()

  // The pane to a folder: Cmd/Ctrl+Enter on it.
  await tree.locator('.tree-row', { hasText: 'src' }).click()
  await page.locator('.tree-list').press(mac ? 'Meta+Enter' : 'Control+Enter')
  await expect(page.locator('.tab.active .tab-name')).toHaveText('src', { timeout: 10_000 })
  await app.close()
})
