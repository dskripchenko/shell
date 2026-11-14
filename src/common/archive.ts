/** Archives in the file panels: which files are, and an archive's folder as a panel's path. */

/** The archive kind by the file's name, or null. */
export function archiveKind(name: string): 'zip' | 'tar' | 'tgz' | null {
  const n = name.toLowerCase()
  if (/\.(zip|jar|war|apk|xpi|epub|docx|xlsx|pptx|odt|whl|nupkg|vsix)$/.test(n)) return 'zip'
  if (/\.(tar\.gz|tgz)$/.test(n)) return 'tgz'
  if (n.endsWith('.tar')) return 'tar'
  return null
}

const PREFIX = 'archive:'

/** A folder inside an archive as a panel's path: `archive:/x/a.zip::src/lib` ('' — its top). */
export function archivePath(file: string, inner = ''): string {
  return `${PREFIX}${file}::${inner.replace(/^\/+|\/+$/g, '')}`
}

export function parseArchive(path: string): { file: string; inner: string } | null {
  if (!path.startsWith(PREFIX)) return null
  const at = path.indexOf('::', PREFIX.length)
  if (at < 0) return null
  return { file: path.slice(PREFIX.length, at), inner: path.slice(at + 2) }
}

/** The folder above inside an archive; at its top, the folder the archive is in. */
export function archiveUp(path: string, parentOf: (dir: string) => string): string {
  const a = parseArchive(path)!
  if (!a.inner) return parentOf(a.file)
  return archivePath(a.file, a.inner.split('/').slice(0, -1).join('/'))
}

/** An entry of an archive's folder as a panel's path. */
export function archiveJoin(path: string, name: string): string {
  const a = parseArchive(path)!
  return archivePath(a.file, a.inner ? `${a.inner}/${name}` : name)
}
