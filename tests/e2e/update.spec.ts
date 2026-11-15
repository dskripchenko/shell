import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dataFolder, launch } from './app'

/** The archive's name for this system, as the release names it. */
function assetName(version: string): string {
  if (process.platform === 'darwin') return `shell-${version}-mac-${process.arch}.zip`
  if (process.platform === 'win32') return `shell-${version}-win-x64.zip`
  return `shell-${version}-linux-x64.AppImage`
}

test('updates from the settings: checked by a button, the outcome said; a broken download is an error, not an update', async () => {
  // A test feed in place of GitHub: first no later release, then one whose archive does not match its checksum.
  let tag = 'v0.0.1'
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    if (req.url === '/latest') {
      const name = assetName(tag.slice(1))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ tag_name: tag, assets: [{ name, browser_download_url: `${base}/a` }, { name: `${name}.sha256`, browser_download_url: `${base}/a.sha256` }] }))
    } else if (req.url === '/a') res.end('not the archive')
    else if (req.url === '/a.sha256') res.end('0'.repeat(64) + '  a\n')
    else res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  // Not checked at start: the button does it.
  const { app, page } = await launch(dataFolder('[updates]\nauto = false\n'), { SHELL_UPDATE_URL: `http://127.0.0.1:${port}/latest` })
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

  await page.keyboard.press(`${mod}+Comma`)
  const settings = page.getByRole('dialog', { name: 'Настройки' })
  await expect(settings.getByText(/^Версия \d+\.\d+\.\d+/)).toBeVisible()
  await expect(settings.getByRole('checkbox', { name: 'Проверять обновления раз в сутки' })).not.toBeChecked()

  await settings.getByTestId('update-check').click()
  await expect(settings.getByTestId('update-note')).toHaveText('Это последняя версия')
  await expect(page.locator('.status-message')).toContainText('Это последняя версия')

  tag = 'v999.0.0'
  await settings.getByTestId('update-check').click()
  await expect(settings.getByTestId('update-note')).toContainText('Обновление не удалось: архив не совпал с контрольной суммой')
  await expect(settings.getByTestId('update-restart')).toHaveCount(0)
  await expect(settings.getByTestId('update-check')).toBeEnabled()

  await app.close()
  server.close()
})
