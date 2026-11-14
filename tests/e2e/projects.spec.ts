import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'the stand-in agent is a POSIX script')

test('a project: a group saved with its agent, opened again after closing — the agent started anew — and switched to when open', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shell-home-')))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'helper'), '#!/bin/sh\necho "helper is up in $(pwd)"\nsleep 60\n')
  chmodSync(join(bin, 'helper'), 0o755)
  const repo = join(home, 'app')
  mkdirSync(join(repo, 'web'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: repo })

  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), `[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n[agents]\ncommands = ["helper"]\n[profiles.app]\ncwd = "${repo}/web"\n`)
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}` } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  const palette = async (text: string, keys = mac ? 'Meta+Shift+p' : 'Control+Shift+p') => {
    await page.keyboard.press(keys)
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())

  // A group of its own, a tab in the repository's sub-folder running the agent.
  await palette('Новая группа')
  await page.getByRole('dialog').getByRole('textbox').fill('app')
  await page.keyboard.press('Enter')
  await palette('Новая вкладка: app')
  await expect(page.locator('.tab.active .tab-name')).toHaveText('web', { timeout: 20_000 })
  await page.keyboard.type('helper')
  await page.keyboard.press('Enter')
  await expect.poll(text).toContain(`helper is up in ${repo}/web`)

  // Saved: the root is the repository's, the folder kept by its place, the agent by its command.
  await palette('Сохранить группу как проект')
  const file = join(data, 'projects.json')
  await expect.poll(() => existsSync(file)).toBe(true)
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { projects: { name: string; root: string; tabs: { root: { cwd?: string; command?: string } }[] }[] }
  expect(saved.projects).toHaveLength(1)
  expect(saved.projects[0]).toMatchObject({ name: 'app', root: repo })
  expect(saved.projects[0]!.tabs.map((t) => t.root)).toContainEqual({ kind: 'pane', cwd: 'web', profile: 'app', command: 'helper' })

  // Closed, opened again from the switcher: the tabs back, the agent started in its folder.
  await palette('Закрыть группу')
  await expect(page.locator('.group-name', { hasText: 'app' })).toHaveCount(0)
  await palette('app', mac ? 'Meta+Shift+o' : 'Control+Shift+o')
  await expect(page.locator('.group-name', { hasText: 'app' })).toHaveCount(1)
  await expect(page.locator('.tab')).toHaveCount(saved.projects[0]!.tabs.length)
  await page.locator('.tab', { hasText: 'web' }).click()
  await expect.poll(text, { timeout: 20_000 }).toContain(`helper is up in ${repo}/web`)

  // Opened while open: the same group shown, none added.
  await palette('Группа: Основная')
  await palette('app', mac ? 'Meta+Shift+o' : 'Control+Shift+o')
  await expect(page.locator('.group-name', { hasText: 'app' })).toHaveCount(1)
  await expect(page.locator('.group-row.active .group-name')).toHaveText('app')
  await app.close()
})
