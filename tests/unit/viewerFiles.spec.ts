import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ViewerFiles } from '../../src/main/viewer'

describe('the viewer’s files', () => {
  it('a document opened: its folder served, nothing outside it; the app gives only its viewer page and vendor files', async () => {
    const app = mkdtempSync(join(tmpdir(), 'shell-app-'))
    mkdirSync(join(app, 'vendor'))
    writeFileSync(join(app, 'viewer.html'), '<html>viewer</html>')
    writeFileSync(join(app, 'vendor', 'embed.bundle.js'), 'x')
    writeFileSync(join(app, 'index.html'), 'the window')
    const repo = mkdtempSync(join(tmpdir(), 'shell-repo-'))
    mkdirSync(join(repo, 'docs'))
    mkdirSync(join(repo, 'img'))
    writeFileSync(join(repo, 'docs', 'a b.md'), '# A\n![](../img/p.png)\n')
    writeFileSync(join(repo, 'img', 'p.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]))
    const outside = mkdtempSync(join(tmpdir(), 'shell-out-'))
    writeFileSync(join(outside, 'secret.txt'), 'no')

    const v = new ViewerFiles(app)
    const doc = await v.open(join(repo, 'docs', 'a b.md'), repo)
    if ('error' in doc) throw new Error(doc.error)
    expect(doc.text).toBe('# A\n![](../img/p.png)\n')
    expect(doc.name).toBe('a b.md')
    expect(doc.base).toMatch(/^shell-doc:\/\/r-[0-9a-f]+\/docs\/$/)
    const img = await v.handle(new URL('../img/p.png', doc.base).href)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(img.headers.get('access-control-allow-origin')).toBe('*')
    // Out of the folder, or a folder not opened: not served.
    expect((await v.handle(doc.base.replace(/docs\/$/, '') + '..%2F' + 'x')).status).toBe(404)
    expect((await v.handle(`shell-doc://r-000000000000/${encodeURIComponent(join(outside, 'secret.txt'))}`)).status).toBe(404)
    // The app: its viewer and vendor files only.
    expect((await v.handle('shell-doc://app/viewer.html')).status).toBe(200)
    expect((await v.handle('shell-doc://app/vendor/embed.bundle.js')).status).toBe(200)
    expect((await v.handle('shell-doc://app/index.html')).status).toBe(404)
    // A binary file: no text.
    const bin = await v.open(join(repo, 'img', 'p.png'), repo)
    expect('text' in bin && bin.text).toBe(null)
  })
})
