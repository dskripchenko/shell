import { expect, test } from '@playwright/test'
import { MOD, launch, type } from './app'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.skip(process.platform === 'win32', 'driven with bash')

test('triggers: a word highlighted, a prompt answered, a tab marked, a line said', async () => {
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(
    join(data, 'config.toml'),
    `[shell]
program = "/bin/bash"
args = []
[quake]
enabled = false
[[triggers]]
pattern = "boom"
action = "highlight"
color = "#ff000055"
[[triggers]]
pattern = "Continue\\\\? \\\\[y/N\\\\]"
action = "send"
text = "y\\r"
[[triggers]]
pattern = "mark-me"
action = "mark"
[[triggers]]
pattern = "say-me"
action = "notify"
`,
  )
  const { app, page } = await launch(data)
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())

  await type(page, "printf 'a boom b\\n'")
  await expect(page.locator('.pane.focused .dsk-term-mark-text', { hasText: 'boom' }).last()).toHaveAttribute('style', 'background:#ff000055')

  // A prompt not ended by a newline: answered.
  await type(page, 'read -p "Continue? [y/N] " a; echo "answer=$a"')
  await expect.poll(text).toContain('answer=y')

  // Told: the pane is in sight, so in the status bar (out of sight, a notification of the system).
  await type(page, 'echo say-me')
  await expect(page.locator('.status-message')).toContainText('Триггер: say-me')

  // A tab not in front: marked, until looked at.
  await type(page, 'sleep 1; echo mark-me')
  await page.keyboard.press(`${MOD}+t`)
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect(page.locator('.tab').nth(0).locator('.tab-marked')).toBeVisible({ timeout: 10_000 })
  await page.locator('.tab').nth(0).click()
  await expect(page.locator('.tab-marked')).toHaveCount(0)
  await app.close()
})
