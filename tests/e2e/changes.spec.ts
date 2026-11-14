import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editsHookCommand } from '../../packages/shell-integration/src/agentEdits'

const mac = process.platform === 'darwin'

// An agent that edits a file and adds one, a moment after it starts (the baseline is taken as it starts).
const EDITOR = `#!/bin/sh
sleep 1
printf 'one\\nTWO, by the agent\\nthree\\n' > a.txt
# Its edit of a.txt told to the journal, as Claude Code's hook does it (added.txt not: made by hand, say).
printf '{"session_id":"s1","tool_name":"Edit","cwd":"%s","tool_input":{"file_path":"%s/a.txt"}}' "$PWD" "$PWD" | sh "$EDITS_HOOK"
printf 'new file\\n' > added.txt
shell-notify done --agent editor
sleep 30
`

test.skip(process.platform === 'win32', 'the stand-in agent is a POSIX script')

test('an agent’s changes: the files since it started, a diff, a comment on a line sent to it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'shell-home-'))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'editor'), EDITOR)
  writeFileSync(join(home, 'edits-hook.sh'), editsHookCommand())
  chmodSync(join(bin, 'editor'), 0o755)
  const repo = join(home, 'project')
  mkdirSync(repo)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n')
  git('add', '.')
  git('commit', '-qm', 'start')

  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), `[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n[agents]\ncommands = ["editor"]\n[profiles.project]\ncwd = "${repo}"\n`)
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: home, PATH: `${bin}:${process.env.PATH}`, EDITS_HOOK: join(home, 'edits-hook.sh') } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  const palette = async (text: string) => {
    await page.keyboard.press(mac ? 'Meta+Shift+p' : 'Control+Shift+p')
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  // A tab in the repository, the agent started there.
  await palette('Новая вкладка: project')
  await expect(page.locator('.tab')).toHaveCount(2)
  // Ready when its shell has said its folder: the tab takes the folder's name.
  await expect(page.locator('.tab.active .tab-name')).toHaveText('project', { timeout: 20_000 })
  await page.keyboard.type('editor')
  await page.keyboard.press('Enter')

  await page.keyboard.press(mac ? 'Meta+Shift+g' : 'Control+Shift+g')
  const panel = page.locator('.changes')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.changes-file')).toHaveCount(2, { timeout: 15_000 })
  await expect(panel.locator('.changes-file').nth(0)).toContainText('a.txt')
  await expect(panel.locator('.changes-file').nth(1)).toContainText('added.txt')
  await expect(panel.locator('.changes-sub')).toContainText('editor')

  // The diff of a.txt: «two» out, «TWO, by the agent» in.
  await panel.locator('.changes-file').nth(0).click()
  const added = panel.locator('.diff-line.add', { hasText: 'TWO, by the agent' })
  await expect(added).toBeVisible()
  await expect(panel.locator('.diff-line.del', { hasText: 'two' })).toBeVisible()

  // A comment on the added line, pasted into the agent's pane.
  await added.click()
  await panel.locator('.diff-comment textarea').fill('keep it lower case')
  await panel.locator('.diff-comment button[type=submit]').click()
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  await expect.poll(text).toContain('a.txt:2 — keep it lower case')

  // Who edited what, from the journal shared with folio: a.txt by this pane's agent; only its edits on request.
  await expect(panel.locator('.changes-file', { hasText: 'a.txt' }).locator('.file-editor')).toHaveText('этот агент')
  await expect(panel.locator('.changes-file', { hasText: 'added.txt' }).locator('.file-editor')).toHaveCount(0)
  await panel.getByLabel('Только правки этого агента').check()
  await expect(panel.locator('.changes-file')).toHaveCount(1)
  await panel.getByLabel('Только правки этого агента').uncheck()

  // Marked viewed; the count says so.
  await panel.locator('.file-viewed').nth(0).check()
  await expect(panel.locator('.changes-count')).toContainText('1/2')
  await app.close()
})
