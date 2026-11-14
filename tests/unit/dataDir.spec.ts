import { describe, expect, it } from 'vitest'
import { dataDir } from '../../src/main/dataDir'

const base = { env: {}, packaged: true, cwd: '/work' }

describe('the data folder: beside the program', () => {
  it('macOS: beside the .app', () => {
    expect(dataDir({ ...base, platform: 'darwin', execPath: '/Users/me/Apps/shell.app/Contents/MacOS/shell' })).toBe('/Users/me/Apps/shell-data')
  })

  it('Windows: beside the .exe, or where the portable build was started', () => {
    expect(dataDir({ ...base, platform: 'win32', execPath: 'D:\\Tools\\shell\\shell.exe' })).toBe('D:\\Tools\\shell\\shell-data')
    expect(dataDir({ ...base, env: { PORTABLE_EXECUTABLE_DIR: 'E:\\USB' }, platform: 'win32', execPath: 'C:\\Temp\\x\\shell.exe' })).toBe('E:\\USB\\shell-data')
  })

  it('Linux: beside the AppImage, not its mount', () => {
    expect(dataDir({ ...base, env: { APPIMAGE: '/home/me/bin/shell.AppImage' }, platform: 'linux', execPath: '/tmp/.mount_x/shell' })).toBe('/home/me/bin/shell-data')
  })

  it('SHELL_DATA wins; not packaged: a folder in the working one', () => {
    expect(dataDir({ ...base, env: { SHELL_DATA: 'tmp/data' }, platform: 'linux', execPath: '/x/shell' })).toBe('/work/tmp/data')
    expect(dataDir({ ...base, packaged: false, platform: 'darwin', execPath: '/x/Electron' })).toBe('/work/.shell-data')
  })
})
