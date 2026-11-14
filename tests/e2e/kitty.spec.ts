import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dataFolder, launch, type } from './app'

test.skip(process.platform === 'win32', 'driven with sh')

test('the kitty keyboard protocol: a program that asks for it gets Shift+Enter and Esc of their own', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-kitty-'))
  // Asks for "disambiguate", shows what each key sends as hex, ends on q.
  const script = join(dir, 'keys.cjs')
  writeFileSync(
    script,
    `process.stdin.setRawMode(true); process.stdout.write('\\x1b[>1uready\\r\\n');
     process.stdin.on('data', (d) => { if (d.toString() === 'q') { process.stdout.write('\\x1b[<u'); process.exit(0) } process.stdout.write('got ' + d.toString('hex') + '\\r\\n') })`,
  )
  const { app, page } = await launch(dataFolder())
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  await type(page, `node "${script}"`)
  await expect.poll(text).toContain('ready')
  await page.keyboard.press('Shift+Enter')
  await expect.poll(text).toContain('got 1b5b31333b3275')
  await page.keyboard.press('Escape')
  await expect.poll(text).toContain('got 1b5b323775')
  await page.keyboard.press('Enter')
  await expect.poll(text).toContain('got 0d')
  await page.keyboard.type('q')
  await app.close()
})

test('flags a program left behind are dropped at the shell’s prompt: Ctrl+C reaches the shell as before', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-kitty-'))
  const data = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  writeFileSync(join(data, 'config.toml'), '[shell]\nprogram = "/bin/bash"\nargs = []\n[quake]\nenabled = false\n')
  const crash = join(dir, 'crash.cjs')
  writeFileSync(crash, "process.stdout.write('\\x1b[>1ugone\\r\\n'); process.exit(1)")
  const { app, page } = await launch(data)
  const text = () => page.evaluate(() => (window as unknown as { shellTest: { text(): string } }).shellTest.text())
  await type(page, `node "${crash}"`)
  await expect.poll(text).toContain('gone')
  await page.keyboard.type('sleep 30')
  await page.keyboard.press('Control+c')
  await type(page, 'echo alive-$((1+1))')
  await expect.poll(text).toContain('alive-2')
  await app.close()
})
