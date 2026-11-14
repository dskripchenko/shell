import { expect, test } from '@playwright/test'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const mac = process.platform === 'darwin'

// A stand-in for an agent: it works a second (a spinner), asks for permission
// as Claude Code does (OSC 9), waits for the answer, says it and ends.
const FAKE_AGENT = `#!/bin/sh
i=0
while [ $i -lt 12 ]; do printf '\\r⠋ thinking %s' $i; sleep 0.1; i=$((i+1)); done
printf '\\n\\033]9;Claude needs your permission\\007'
read answer
printf 'answer: %s\\n' "$answer"
sleep 0.3
`

test.skip(process.platform === 'win32', 'the stand-in agent is a POSIX script')

test('an agent started from the palette: working, waiting for the person, done — on its tab and group', async () => {
  const home = mkdtempSync(join(tmpdir(), 'shell-home-'))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), FAKE_AGENT)
  chmodSync(join(bin, 'claude'), 0o755)
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  // bash with the marks: they tell the command that runs, so the agent is known.
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}` } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')

  await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
  await page.keyboard.type('Новый агент: claude')
  await page.keyboard.press('Enter')
  const tab = page.locator('.tab.active')
  await expect(tab.locator('.tab-name')).toHaveText('claude')

  await expect(tab.locator('.agent-mark.running')).toBeVisible({ timeout: 20_000 })
  await expect(tab.locator('.agent-mark.waiting')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.group-row.active .agent-mark.waiting')).toBeVisible()
  await expect(page.locator('.status-agents')).toContainText('claude ждёт ввода')

  // The answer; then another tab is looked at, so the agent's end is not seen: done, on its tab.
  await page.keyboard.type('yes')
  await page.keyboard.press('Enter')
  const agentTab = page.locator('.tab', { hasText: 'claude' })
  await page.locator('.tab').first().click()
  await expect(agentTab.locator('.agent-mark.done')).toBeVisible({ timeout: 20_000 })
  // Looked at, the ended agent's mark goes.
  await agentTab.click()
  await expect(agentTab.locator('.agent-mark')).toHaveCount(0, { timeout: 5_000 })
  await app.close()
})

// An agent that tells its turns with shell-notify and is quiet otherwise.
const SIGNALLING_AGENT = `#!/bin/sh
shell-notify running
sleep 1
shell-notify waiting "Codex needs approval" --agent codex
read answer
sleep 2
shell-notify done
sleep 30
`

test('an agent that tells its turns with shell-notify: waiting, then done while it still runs; Claude Code hooks put in', async () => {
  const home = mkdtempSync(join(tmpdir(), 'shell-home-'))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'codex'), SIGNALLING_AGENT)
  chmodSync(join(bin, 'codex'), 0o755)
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}` } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')

  await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
  await page.keyboard.type('Новый агент: codex')
  await page.keyboard.press('Enter')
  const agentTab = page.locator('.tab', { hasText: 'codex' })
  await expect(agentTab.locator('.agent-mark.waiting')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.status-agents')).toContainText('codex ждёт ввода')
  await page.keyboard.type('ok')
  await page.keyboard.press('Enter')
  await page.locator('.tab').first().click()
  // Its process still runs (sleep 30): done is what it said, not its end.
  await expect(agentTab.locator('.agent-mark.done')).toBeVisible({ timeout: 10_000 })

  // The palette puts Claude Code's hooks in ~/.claude/settings.json.
  await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
  await page.keyboard.type('Claude Code: точные')
  await page.keyboard.press('Enter')
  await expect(page.locator('.status-message')).toContainText('подключены')
  const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'))
  expect(Object.keys(settings.hooks).sort()).toEqual(['Notification', 'PostToolUse', 'Stop', 'UserPromptSubmit'])
  await app.close()
})
