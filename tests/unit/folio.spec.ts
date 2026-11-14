import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findFolio, folioArgs, folioRequest, type FindInput } from '../../src/main/folio'

/** A machine of files: `files` exist, the presence file reads as `presence`. */
function machine(files: string[], over: Partial<FindInput> = {}, presence?: object): FindInput {
  const tmp = '/tmp/u'
  const at = join(tmp, 'folio-presence.json')
  return {
    configured: '',
    env: { PATH: '/usr/bin:/opt/bin' },
    platform: 'darwin',
    execPath: '/Users/me/apps/shell.app/Contents/MacOS/shell',
    home: '/Users/me',
    tmp,
    uid: 501,
    isFile: (p) => files.includes(p),
    read: (p) => {
      if (p === at && presence) return JSON.stringify(presence)
      throw new Error('ENOENT')
    },
    owner: (p) => (p === at && presence ? 501 : null),
    list: () => [],
    alive: (pid) => pid === 42,
    ...over,
  }
}

describe.skipIf(process.platform === 'win32')('folio, found', () => {
  it('by the config first, a Mac bundle taken for its program', () => {
    const exe = '/x/folio.app/Contents/MacOS/folio'
    expect(findFolio(machine([exe], { configured: '/x/folio.app' }))).toEqual({ launch: [exe], running: false })
    // A path set and not there: not looked for elsewhere.
    expect(findFolio(machine(['/opt/bin/folio'], { configured: '/nowhere/folio' }))).toBeNull()
  })

  it('as the running folio, by its presence file — of this user, of a live process', () => {
    const presence = { pid: 42, launch: ['/dev/electron', '/dev/folio'], capabilities: ['open'] }
    expect(findFolio(machine(['/dev/electron'], {}, presence))).toEqual({ launch: ['/dev/electron', '/dev/folio'], running: true, projects: [] })
    // Its projects, the well-formed ones.
    const listed = findFolio(machine(['/dev/electron'], {}, { ...presence, projects: [{ name: 'notes', path: '/w/notes' }, { name: 'rel', path: 'w' }, null] }))
    expect(listed?.projects).toEqual([{ name: 'notes', path: '/w/notes' }])
    expect(findFolio(machine(['/dev/electron'], {}, { ...presence, pid: 7 }))).toBeNull()
    expect(findFolio(machine(['/dev/electron'], { owner: () => 0 }, presence))).toBeNull()
    expect(findFolio(machine([], {}, presence))).toBeNull()
    expect(findFolio(machine(['/dev/electron'], {}, { pid: 42, launch: [] }))).toBeNull()
  })

  it('in PATH, then the usual places', () => {
    expect(findFolio(machine(['/opt/bin/folio', '/Applications/folio.app/Contents/MacOS/folio']))?.launch).toEqual(['/opt/bin/folio'])
    expect(findFolio(machine(['/Users/me/Applications/folio.app/Contents/MacOS/folio']))?.launch).toEqual(['/Users/me/Applications/folio.app/Contents/MacOS/folio'])
    expect(findFolio(machine(['/Users/me/apps/folio.app/Contents/MacOS/folio']))?.launch).toEqual(['/Users/me/apps/folio.app/Contents/MacOS/folio'])
    expect(findFolio(machine([]))).toBeNull()
    // Linux: the newest AppImage beside shell.
    const linux = machine([join('/opt/shell', 'folio-1.14.0-linux-x64.AppImage')], { platform: 'linux', execPath: '/opt/shell/shell', env: {}, list: () => ['folio-1.13.2-linux-x64.AppImage', 'folio-1.14.0-linux-x64.AppImage', 'shell.AppImage'] })
    expect(findFolio(linux)?.launch).toEqual([join('/opt/shell', 'folio-1.14.0-linux-x64.AppImage')])
  })
})

describe('folio, asked', () => {
  it('takes absolute paths and a positive line only', () => {
    expect(folioRequest({ file: { path: '/r/a.ts', line: 3 } })).toEqual({ file: { path: '/r/a.ts', line: 3 } })
    expect(folioRequest({ review: '/r', project: '/p' })).toEqual({ review: '/r', project: '/p' })
    expect(folioRequest({ file: { path: 'a.ts' } })).toBeNull()
    expect(folioRequest({ file: { path: '/r/a.ts', line: 0 } })).toBeNull()
    expect(folioRequest({ review: '--inspect' })).toBeNull()
    expect(folioRequest({})).toBeNull()
    expect(folioRequest('x')).toBeNull()
  })

  it('becomes folio’s command line', () => {
    expect(folioArgs({ file: { path: '/r/a.ts', line: 12 } })).toEqual(['/r/a.ts:12'])
    expect(folioArgs({ file: { path: '/r/a.ts' }, review: '/r', project: '/p' })).toEqual(['--project', '/p', '--review', '/r', '/r/a.ts'])
  })
})
