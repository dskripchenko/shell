import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dataFolder, launch, type } from './app'

test.skip(process.platform === 'win32', 'driven with sh')

test('pictures in a pane: a sixel one and a kitty PNG, drawn over their cells', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-pictures-'))
  const script = join(dir, 'show.cjs')
  // What chafa or an image viewer would write: a red sixel square, then a 2×2 PNG by the kitty protocol.
  writeFileSync(
    script,
    `process.stdout.write('\\x1bP0;1q"1;1;16;12#1;2;100;0;0!16~-!16~\\x1b\\\\\\n')
     process.stdout.write('\\x1b_Ga=T,f=100;iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAeBQHDqPLJlQAAAABJRU5ErkJggg==\\x1b\\\\\\n')`,
  )
  const { app, page } = await launch(dataFolder())
  await type(page, `node "${script}"`)
  const pictures = page.locator('.pane.focused .dsk-term-picture')
  await expect(pictures).toHaveCount(2)
  expect(await pictures.evaluateAll((els) => els.map((e) => e.tagName))).toEqual(['CANVAS', 'IMG'])
  // Cleared with the screen.
  await type(page, 'clear')
  await expect(pictures).toHaveCount(0)
  await app.close()
})
