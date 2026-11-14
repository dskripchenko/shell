import { _electron as electron, expect, test, type FrameLocator } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mac = process.platform === 'darwin'
test.skip(process.platform === 'win32', 'driven with bash')

test('the viewer: markdown with a live diagram and a picture of its folder, code, a link to another file; a path in the output opens it', async () => {
  const work = mkdtempSync(join(tmpdir(), 'shell-view-'))
  mkdirSync(join(work, 'docs'))
  // A 1×1 PNG.
  writeFileSync(join(work, 'docs', 'dot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
  writeFileSync(join(work, 'docs', 'guide.md'), '# Guide\n\nSee [the code](code.ts).\n\n![dot](dot.png)\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\n')
  writeFileSync(join(work, 'docs', 'code.ts'), 'export const answer = 42\n')
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', HOME: work } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  await expect(page.locator('.tab.active .tab-name')).toHaveText(work.split('/').pop()!, { timeout: 20_000 })

  // The path an agent would print, clicked with Cmd (Ctrl): the viewer opens it.
  await page.keyboard.type('echo "wrote docs/guide.md:3"')
  await page.keyboard.press('Enter')
  const link = page.locator('.pane.focused .dsk-term-link', { hasText: 'docs/guide.md:3' }).last()
  await expect(link).toBeVisible()
  await link.click({ modifiers: [mac ? 'Meta' : 'Control'] })

  const viewer = page.locator('.viewer')
  await expect(viewer.locator('.changes-title')).toHaveText('guide.md')
  const doc: FrameLocator = page.frameLocator('.viewer-frame')
  await expect(doc.locator('h1')).toHaveText('Guide', { timeout: 20_000 })
  // The live block drawn, the picture of the document's folder loaded.
  await expect(doc.locator('svg').first()).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => doc.locator('img[alt="dot"]').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1)

  // A link to another file of the folder: shown in the viewer, as highlighted code.
  await doc.locator('a', { hasText: 'the code' }).click()
  await expect(viewer.locator('.changes-title')).toHaveText('code.ts')
  await expect(doc.locator('pre, code').first()).toContainText('answer = 42', { timeout: 20_000 })

  // The document cannot reach the window: no IPC in its frame.
  expect(await page.frames().find((f) => f.url().startsWith('shell-doc://app/viewer.html'))!.evaluate(() => typeof (window as unknown as { shell?: unknown }).shell)).toBe('undefined')
  await app.close()
})
