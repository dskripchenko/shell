import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assetFor, installedAt, newer, pickRelease, shaOf, Updater, type UpdateState } from '../../src/main/update'

const PRODUCT = { name: 'shell', repo: 'dskripchenko/shell', dataFolder: 'shell-data' }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shell-update-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const release = (tag: string, names: string[], extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  assets: names.map((name) => ({ name, browser_download_url: `https://example.com/${name}` })),
  ...extra,
})

function server(files: Record<string, Buffer | string>, json: unknown): (url: string) => Promise<Response> {
  return async (url) => {
    if (url === 'releases') return new Response(JSON.stringify(json))
    const name = url.replace('https://example.com/', '')
    return name in files ? new Response(new Uint8Array(Buffer.from(files[name]!))) : new Response('missing', { status: 404 })
  }
}

describe('updates', () => {
  it('names the archive of each system; compares versions', () => {
    expect(assetFor('shell', '1.2.0', 'darwin', 'arm64')).toBe('shell-1.2.0-mac-arm64.zip')
    expect(assetFor('shell', '1.2.0', 'win32', 'x64')).toBe('shell-1.2.0-win-x64.zip')
    expect(assetFor('shell', '1.2.0', 'linux', 'x64')).toBe('shell-1.2.0-linux-x64.AppImage')
    expect(assetFor('shell', '1.2.0', 'linux', 'arm64')).toBeNull()
    expect(newer('1.10.0', '1.9.9')).toBe(true)
    expect(newer('1.0.0', '1.0.0')).toBe(false)
    expect(newer('1.1.0-beta.1', '1.0.0')).toBe(false)
  })

  it('takes a later release with this system’s archive and its checksum; nothing else', () => {
    const names = ['shell-0.2.0-linux-x64.AppImage', 'shell-0.2.0-linux-x64.AppImage.sha256']
    expect(pickRelease(release('v0.2.0', names), 'shell', '0.1.0', 'linux', 'x64')).toEqual({
      version: '0.2.0',
      name: names[0],
      url: `https://example.com/${names[0]}`,
      shaUrl: `https://example.com/${names[1]}`,
    })
    expect(pickRelease(release('v0.2.0', names), 'shell', '0.2.0', 'linux', 'x64')).toBeNull()
    expect(pickRelease(release('v0.2.0', names.slice(0, 1)), 'shell', '0.1.0', 'linux', 'x64')).toBeNull()
    expect(pickRelease(release('v0.2.0', names, { draft: true }), 'shell', '0.1.0', 'linux', 'x64')).toBeNull()
    expect(pickRelease(release('v0.2.0', names), 'shell', '0.1.0', 'win32', 'x64')).toBeNull()
  })

  it('reads a checksum file; knows where the program is', () => {
    const hex = 'ab'.repeat(32)
    expect(shaOf(`${hex}  shell.zip\n`)).toBe(hex)
    expect(shaOf('nothing')).toBeNull()
    expect(installedAt('darwin', '/Apps/x/shell.app/Contents/MacOS/shell')).toBe('/Apps/x/shell.app')
    expect(installedAt('linux', '/tmp/.mount/shell', '/home/a/shell.AppImage')).toBe('/home/a/shell.AppImage')
    expect(installedAt('linux', '/tmp/.mount/shell')).toBeNull()
  })

  it('downloads, checks and stages a newer version; it takes the program’s place on leaving, and is cleared after', async () => {
    const program = join(dir, 'shell.AppImage')
    writeFileSync(program, 'old')
    const body = Buffer.from('new program')
    const name = 'shell-0.2.0-linux-x64.AppImage'
    const sha = createHash('sha256').update(body).digest('hex')
    const states: UpdateState['status'][] = []
    const make = (current: string) =>
      new Updater({
        product: PRODUCT,
        dir: join(dir, 'shell-data', 'update'),
        current,
        platform: 'linux',
        arch: 'x64',
        execPath: '/tmp/.mount/shell',
        appImage: program,
        fetch: server({ [name]: body, [`${name}.sha256`]: `${sha}  ${name}\n` }, release('v0.2.0', [name, `${name}.sha256`])),
        releases: 'releases',
        onState: (s) => states.push(s.status),
      })
    const u = make('0.1.0')
    expect(u.due()).toBe(true)
    expect(await u.check()).toEqual({ status: 'ready', version: '0.2.0' })
    expect(states.filter((x, i) => x !== states[i - 1])).toEqual(['checking', 'downloading', 'ready'])
    expect(u.due()).toBe(false)
    const again = make('0.1.0')
    again.tidy()
    expect(again.current).toEqual({ status: 'ready', version: '0.2.0' })
    u.restartAfter()
    expect(u.apply(1)).toEqual({ relaunch: true, execPath: program })
    expect(readFileSync(program, 'utf8')).toBe('new program')
    const next = make('0.2.0')
    next.tidy()
    expect(next.current).toEqual({ status: 'idle' })
    expect(existsSync(join(dir, 'shell-data', 'update', '0.2.0'))).toBe(false)
  })

  it('a download that does not match its checksum is dropped; the latest one is said so', async () => {
    const name = 'shell-0.2.0-linux-x64.AppImage'
    const fetch = server({ [name]: 'tampered', [`${name}.sha256`]: 'cd'.repeat(32) }, release('v0.2.0', [name, `${name}.sha256`]))
    const base = { product: PRODUCT, platform: 'linux' as const, arch: 'x64', execPath: '/x', fetch, releases: 'releases', onState: () => undefined }
    const u = new Updater({ ...base, dir: join(dir, 'u'), current: '0.1.0', appImage: join(dir, 'a') })
    expect(await u.check()).toEqual({ status: 'error', error: 'архив не совпал с контрольной суммой' })
    mkdirSync(join(dir, 'v'))
    const latest = new Updater({ ...base, dir: join(dir, 'v'), current: '0.2.0' })
    expect(await latest.check()).toEqual({ status: 'latest' })
    expect(latest.apply(1)).toEqual({ relaunch: false })
  })
})
