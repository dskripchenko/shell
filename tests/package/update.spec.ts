import { _electron as electron, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'

/**
 * The packaged program updates itself, as folio's does (folio's
 * tests/package/update.spec.ts): offered a later version — its own archive,
 * served here under the name of 99.0.0 with its checksum — it downloads and
 * checks it from the settings' button, and when it closes the program in its
 * place is replaced, with `shell-data/` beside it untouched.
 *
 * SHELL_APP — the executable; SHELL_ARCHIVE — the archive it was unpacked
 * from (on Linux the AppImage itself, also APPIMAGE_FILE: the copy that runs).
 */
const app = process.env.SHELL_APP
const archive = process.env.SHELL_ARCHIVE
test.skip(!app || !archive, 'SHELL_APP and SHELL_ARCHIVE name the packaged program and its archive')

const system = process.platform === 'darwin' ? `mac-${process.arch}.zip` : process.platform === 'win32' ? 'win-x64.zip' : 'linux-x64.AppImage'

/** Where the program is, and a way to tell the old one from its replacement. */
function installed(): { mark: () => void; replaced: () => boolean; data: string } {
  // On Linux the AppImage, on macOS the bundle (macOS does not let another program write inside it): a new file or folder there.
  if (process.platform !== 'win32') {
    const place = process.platform === 'linux' ? process.env.APPIMAGE_FILE! : /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(app!)![1]!
    const inode = statSync(place).ino
    return { mark: () => undefined, replaced: () => existsSync(place) && statSync(place).ino !== inode, data: join(dirname(place), 'shell-data') }
  }
  // On Windows the folder stays and its files are copied over: a file the new version does not have goes.
  const place = dirname(app!)
  const marker = join(place, 'old-version')
  return { mark: () => writeFileSync(marker, 'old'), replaced: () => !existsSync(marker) && existsSync(app!), data: join(place, 'shell-data') }
}

test('a later version downloaded, checked and put in the program’s place when it closes', async () => {
  const bytes = readFileSync(archive!)
  const name = `shell-99.0.0-${system}`
  const sha = createHash('sha256').update(bytes).digest('hex')
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    if (req.url === '/releases') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ tag_name: 'v99.0.0', assets: [name, `${name}.sha256`].map((n) => ({ name: n, browser_download_url: `${base}/${n}` })) }))
    } else if (req.url === `/${name}`) res.end(bytes)
    else if (req.url === `/${name}.sha256`) res.end(`${sha}  ${name}\n`)
    else res.writeHead(404).end()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const target = installed()
  // The person's settings, kept through the update: no check at start (the button does it), no global hotkey.
  const config = '[updates]\nauto = false\n\n[quake]\nenabled = false\n'
  mkdirSync(target.data, { recursive: true })
  writeFileSync(join(target.data, 'config.toml'), config)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'SHELL_DATA' && k !== 'SHELL_E2E' && !k.startsWith('npm_') && !k.startsWith('ELECTRON_')) env[k] = v
  env.SHELL_UPDATE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases`
  if (process.env.APPIMAGE_FILE) env.APPIMAGE = process.env.APPIMAGE_FILE
  try {
    target.mark()
    const electronApp = await electron.launch({ executablePath: app!, env })
    expect(await electronApp.evaluate(({ app }) => app.isPackaged)).toBe(true)
    const win = await electronApp.firstWindow()
    // A packaged program's first start is cold (an AppImage unpacked, the fonts read).
    await win.waitForSelector('.term-host .dsk-term', { timeout: 60_000 })
    await win.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma')
    await expect(win.getByTestId('update-check')).toBeEnabled()
    await win.getByTestId('update-check').click()
    await expect(win.getByTestId('update-restart')).toContainText('99.0.0', { timeout: 150_000 })
    await electronApp.close()
    // Windows copies it over once shell has gone: a moment later.
    await expect.poll(() => target.replaced(), { timeout: 90_000 }).toBe(true)
    expect(readFileSync(join(target.data, 'config.toml'), 'utf8')).toBe(config)
  } finally {
    server.close()
  }
})
