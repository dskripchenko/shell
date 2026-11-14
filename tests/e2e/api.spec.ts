import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.skip(process.platform === 'win32', 'the stand-in agent is a POSIX script')

test('folio’s requests: a tab in a folder, a comment pasted into the agent’s pane, a review shown on its tab; its token only', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shell-home-')))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  // An agent that shows what it is given.
  writeFileSync(join(bin, 'helper'), '#!/bin/sh\necho "helper ready"\nwhile IFS= read -r line; do echo "got: $line"; done\n')
  chmodSync(join(bin, 'helper'), 0o755)
  const repo = join(home, 'app')
  mkdirSync(join(repo, 'src'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: repo })
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), `[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n[agents]\ncommands = ["helper"]\n`)
  const presence = join(home, 'shell-presence.json')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}`, SHELL_PRESENCE: presence } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())

  await expect.poll(() => existsSync(presence)).toBe(true)
  const p = JSON.parse(readFileSync(presence, 'utf8')) as { url: string; token: string; capabilities: string[] }
  expect(p.capabilities).toEqual(['open-tab', 'paste', 'review'])
  const post = (path: string, body: object, token = p.token) => fetch(p.url + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  // A tab in the repository's folder, named as asked.
  expect((await post('/api/open-tab', { cwd: join(repo, 'src'), name: 'from folio' })).status).toBe(200)
  await expect(page.locator('.tab.active .tab-name')).toHaveText('from folio')
  await page.keyboard.type('echo "token=$SHELL_NOTIFY_TOKEN."')
  await page.keyboard.press('Enter')
  await expect.poll(text).toMatch(/token=[0-9a-f]+\./)
  const paneToken = /token=([0-9a-f]+)\./.exec(await text())![1]!
  await page.keyboard.type('helper')
  await page.keyboard.press('Enter')
  await expect.poll(text).toContain('helper ready')

  // A comment pasted into the agent's pane, without Enter: sent by the person. The repository
  // may be spelled through a link (on a Mac /var is /private/var): the same folder.
  const alias = repo.startsWith('/private/') ? repo.slice('/private'.length) : repo
  const r = await post('/api/paste', { repo: alias, text: 'src/a.ts:2 — rename it' })
  expect(r.status).toBe(200)
  expect(await r.json()).toMatchObject({ agent: 'helper' })
  await page.keyboard.press('Enter')
  await expect.poll(text).toContain('got: src/a.ts:2 — rename it')
  expect((await post('/api/paste', { repo: join(home, 'elsewhere'), text: 'x' })).status).toBe(404)

  // A review waiting in folio, shown on the repository's tab, then gone.
  expect((await post('/api/review', { repo, state: 'waiting', message: 'Changes to look at' })).status).toBe(204)
  await expect(page.locator('.tab.active .tab-review')).toHaveAttribute('title', 'folio: Changes to look at')
  expect((await post('/api/review', { repo, state: 'none' })).status).toBe(204)
  await expect(page.locator('.tab-review')).toHaveCount(0)

  // Not with the panes' token, nor with none.
  expect((await post('/api/open-tab', { cwd: repo }, paneToken)).status).toBe(401)
  expect((await fetch(p.url + '/api/open-tab', { method: 'POST', body: '{}' })).status).toBe(401)
  await app.close()
  expect(existsSync(presence)).toBe(false)
})
