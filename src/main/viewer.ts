/**
 * The viewer's own scheme, `shell-doc://`: the viewer page from `shell-doc://app/`
 * (an origin of its own, apart from the window's), and the files of the
 * folders opened for viewing from `shell-doc://r-<id>/<path>` — only those,
 * and nothing outside them. A document is not trusted: it sees its folder,
 * and the window's IPC is out of its reach.
 */
import { randomBytes } from 'node:crypto'
import { open as openFile, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { inside } from './changes'
import { msg } from '../common/i18n'

export const SCHEME = 'shell-doc'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/opus',
  '.pdf': 'application/pdf', '.htm': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
}

/** What an HTML page of a viewed folder may do: its folder's files, inline code; no network, no forms, no frames. */
export const PAGE_CSP = "default-src shell-doc: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'"

export class ViewerFiles {
  private readonly roots = new Map<string, string>()

  /** `appDir`: the built window (dist/renderer), whose viewer page and vendor files are served. */
  constructor(private readonly appDir: string) {}

  /** A folder opened for viewing: its host name, the same for the same folder. */
  rootFor(dir: string): string {
    const full = resolve(dir)
    for (const [id, root] of this.roots) if (root === full) return id
    const id = `r-${randomBytes(6).toString('hex')}`
    this.roots.set(id, full)
    return id
  }

  async handle(url: string): Promise<Response> {
    const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return notFound()
    }
    let path: string
    try {
      path = decodeURIComponent(u.pathname).replace(/^\/+/, '')
    } catch {
      return notFound()
    }
    let full: string | null
    if (u.hostname === 'app') {
      // The viewer page, its script and the embed bundle; nothing else of the app.
      full = /^(viewer\.html|vendor\/[\w.-]+|assets\/[\w.-]+)$/.test(path) ? inside(this.appDir, path) : null
    } else {
      const root = this.roots.get(u.hostname)
      full = root ? inside(root, path) : null
    }
    if (!full) return notFound()
    try {
      const body = await readFile(full)
      const type = TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': type,
          // The viewer page runs sandboxed (an opaque origin): its reads of the folder's files need this.
          'access-control-allow-origin': '*',
          'cache-control': 'no-cache',
          // A page of the folder shown as a page: its own files only, no network, nothing sent anywhere.
          ...(type.startsWith('text/html') && u.hostname !== 'app' ? { 'content-security-policy': PAGE_CSP } : {}),
        },
      })
    } catch {
      return notFound()
    }
  }

  /**
   * A file for the viewer: the address of its folder (the repository's root
   * opened, so `../img.png` from a document works), and its text when it is
   * text and not too big.
   */
  async open(file: string, root: string | null): Promise<{ base: string; url: string; name: string; text: string | null; size: number } | { error: string }> {
    let size: number
    try {
      const s = await stat(file)
      if (!s.isFile()) return { error: msg().main.notFile }
      size = s.size
    } catch {
      return { error: msg().main.fileNotFound }
    }
    const top = root && resolve(file).startsWith(resolve(root) + sep) ? root : dirname(file)
    const id = this.rootFor(top)
    const rel = relative(resolve(top), resolve(file)).split(sep).map(encodeURIComponent)
    const name = rel.at(-1)!
    const base = `${SCHEME}://${id}/${rel.slice(0, -1).map((x) => x + '/').join('')}`
    let text: string | null = null
    if (size <= 5 * 1024 * 1024) {
      const f = await openFile(file, 'r')
      try {
        const head = Buffer.alloc(Math.min(size, 8192))
        await f.read(head, 0, head.length, 0)
        if (!head.includes(0)) text = (await readFile(file)).toString('utf8')
      } finally {
        await f.close()
      }
    }
    return { base, url: base + name, name: decodeURIComponent(name), text, size }
  }
}

export function viewerPage(appDir: string): string {
  return join(appDir, 'viewer.html')
}
