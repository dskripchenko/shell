import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control+Shift'

/** A data folder of its own, with a plain shell so the prompt is the same everywhere. */
export function dataFolder(extra = ''): string {
  const dir = mkdtempSync(join(tmpdir(), 'shell-e2e-'))
  const shell = process.platform === 'win32' ? '' : '[shell]\nprogram = "/bin/sh"\nargs = []\n'
  writeFileSync(join(dir, 'config.toml'), shell + '[quake]\nenabled = false\n' + extra)
  return dir
}

export async function launch(data: string, env: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SHELL_DATA: data, SHELL_E2E: '1', PS1: '$ ', ...env } })
  const page = await app.firstWindow()
  await page.waitForSelector('.term-host .dsk-term')
  return { app, page }
}

/** The text of the focused pane's rows. */
export function screen(page: Page): Promise<string> {
  return page.evaluate(() => [...document.querySelectorAll('.pane.focused .dsk-term-row')].map((r) => r.textContent ?? '').join('\n'))
}

export async function type(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}
