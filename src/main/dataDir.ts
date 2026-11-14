import { posix, win32 } from 'node:path'

/**
 * Where shell keeps everything it keeps — settings, themes, the last session,
 * Chromium's own files: one folder beside the program, never in the user's
 * profile, so deleting it removes shell completely (as folio does).
 *
 *   SHELL_DATA            an explicit folder (tests, a shared copy)
 *   Linux AppImage        beside the .AppImage file
 *   macOS                 beside the .app bundle
 *   Windows and the rest  beside the executable
 *   not packaged          .shell-data in the working folder
 */
export const DATA_DIR = 'shell-data'

export interface DataDirInput {
  env: Record<string, string | undefined>
  platform: NodeJS.Platform
  execPath: string
  packaged: boolean
  cwd: string
}

export function dataDir(input: DataDirInput): string {
  const { dirname, join, resolve } = input.platform === 'win32' ? win32 : posix
  if (input.env.SHELL_DATA) return resolve(input.cwd, input.env.SHELL_DATA)
  if (!input.packaged) return join(input.cwd, '.shell-data')
  if (input.platform === 'linux' && input.env.APPIMAGE) return join(dirname(input.env.APPIMAGE), DATA_DIR)
  if (input.platform === 'darwin') {
    const bundle = input.execPath.match(/^(.*)\/[^/]+\.app\/Contents\/MacOS\/[^/]+$/)
    if (bundle) return join(bundle[1] || '/', DATA_DIR)
  }
  return join(input.env.PORTABLE_EXECUTABLE_DIR || dirname(input.execPath), DATA_DIR)
}
