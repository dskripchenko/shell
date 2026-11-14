import { _electron as electron, expect, test } from '@playwright/test'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'the stand-ins for ssh and sftp are POSIX scripts')

test('SSH hosts from ~/.ssh/config in the palette; a host in the file panels over sftp: copied both ways, a folder made', async () => {
  const home = mkdtempSync(join(tmpdir(), 'shell-home-'))
  mkdirSync(join(home, '.ssh'))
  writeFileSync(join(home, '.ssh', 'config'), 'Host fakebox\n  HostName 10.0.0.1\n  User me\nHost *\n  ServerAliveInterval 30\n')
  const bin = join(home, 'bin')
  mkdirSync(bin)
  copyFileSync(join(import.meta.dirname, 'fakes', 'sftp.mjs'), join(bin, 'sftp'))
  chmodSync(join(bin, 'sftp'), 0o755)
  const server = mkdtempSync(join(tmpdir(), 'shell-server-'))
  mkdirSync(join(server, 'home', 'docs'), { recursive: true })
  writeFileSync(join(server, 'home', 'notes.txt'), 'from the host\n')
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}`, FAKE_SFTP_ROOT: server } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  await expect(page.locator('.tab.active .tab-name')).toHaveText(home.split('/').pop()!, { timeout: 20_000 })

  // The palette: the host of ~/.ssh/config (not its pattern), opened in a tab of its own.
  await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
  await page.keyboard.type('SSH: fakebox')
  await expect(page.locator('.palette-item').first()).toContainText('me@10.0.0.1')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab.active .tab-name')).toHaveText('fakebox')
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  // The host's command typed in its tab (the system's own ssh runs it: a login shell puts its path first).
  await expect.poll(text, { timeout: 20_000 }).toContain("ssh 'fakebox'")

  // Back in the first tab, the file panels; the left one goes to the host from the places (Ctrl+\).
  await page.locator('.tab').first().click()
  await page.keyboard.press('Control+o')
  const cmd = page.locator('.commander')
  await expect(cmd).toBeVisible()
  await page.keyboard.press('Control+Backslash')
  await cmd.locator('.places .palette-item', { hasText: 'fakebox' }).click()
  const left = cmd.locator('.fpanel').first()
  await expect(left.locator('.fpanel-head')).toContainText('sftp://fakebox/home')
  await expect(left.locator('.fpanel-row')).toContainText(['..', 'docs/', 'notes.txt'])

  // From the host to here (the right panel is the home folder).
  await left.locator('.fpanel-row', { hasText: 'notes.txt' }).click()
  await page.keyboard.press('F5')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(home, 'notes.txt'))).toBe(true)
  expect(readFileSync(join(home, 'notes.txt'), 'utf8')).toBe('from the host\n')

  // From here to the host.
  writeFileSync(join(home, 'up.txt'), 'to the host\n')
  await page.keyboard.press('Tab')
  const right = cmd.locator('.fpanel').nth(1)
  await page.keyboard.press('Control+r')
  await right.locator('.fpanel-row', { hasText: 'up.txt' }).click()
  await page.keyboard.press('F5')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(server, 'home', 'up.txt'))).toBe(true)

  // A folder made on the host.
  await page.keyboard.press('Tab')
  await page.keyboard.press('F7')
  await page.keyboard.type('made-there')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(server, 'home', 'made-there'))).toBe(true)
  await expect(left.locator('.fpanel-row.cursor')).toContainText('made-there/')
  await app.close()
})
