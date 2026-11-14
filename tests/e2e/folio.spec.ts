import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'the stand-in folio is a POSIX script')

test('folio, when found: a file from the viewer at its line, a review of the repository, a folder as a project', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shell-home-')))
  const repo = join(home, 'project')
  mkdirSync(join(repo, 'src'), { recursive: true })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1\nexport const b = 2\n')
  git('add', '.')
  git('commit', '-qm', 'start')
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1\nexport const b = 3\n')
  // folio, a stand-in: what it is asked is kept, one argument a line.
  const asked = join(home, 'folio.log')
  const folio = join(home, 'folio')
  writeFileSync(folio, `#!/bin/sh\nprintf '%s\\n' "$@" >> '${asked}'\n`)
  chmodSync(folio, 0o755)
  const said = () => (existsSync(asked) ? readFileSync(asked, 'utf8') : '')

  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), `[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n[folio]\npath = "${folio}"\n[profiles.project]\ncwd = "${repo}"\n`)
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  const palette = async (text: string) => {
    await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await palette('Новая вкладка: project')
  await expect(page.locator('.tab.active .tab-name')).toHaveText('project', { timeout: 20_000 })

  // A path in the output, in the viewer: to folio at its line.
  await page.keyboard.type('echo "see src/a.ts:2"')
  await page.keyboard.press('Enter')
  const link = page.locator('.pane.focused .dsk-term-link', { hasText: 'src/a.ts:2' }).last()
  await expect(link).toBeVisible()
  await link.click({ modifiers: [mac ? 'Meta' : 'Control'] })
  await expect(page.locator('.viewer .changes-title')).toHaveText('a.ts')
  await page.locator('.viewer').getByRole('button', { name: 'Открыть в folio' }).click()
  await expect.poll(said).toContain(`${join(repo, 'src', 'a.ts')}:2\n`)

  // The changes panel: the repository's review.
  await page.locator('.viewer').getByRole('button', { name: 'Закрыть просмотр' }).click()
  await page.keyboard.press(mac ? 'Meta+Shift+g' : 'Control+Shift+g')
  await page.locator('.changes').getByRole('button', { name: 'Ревью в folio' }).click()
  await expect.poll(said).toContain(`--review\n${repo}\n`)

  // The palette: the pane's folder as a project.
  await palette('folio: открыть папку')
  await expect.poll(said).toContain(`--project\n${repo}\n`)
  await app.close()
})
