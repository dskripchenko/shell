/**
 * The terminals themselves: one per pane, alive for as long as the pane is,
 * whether its tab is shown or not. A pane's view is an element moved into the
 * place the layout gives it, and out again when its tab is hidden.
 */
import { Terminal, TerminalView, type TerminalViewOptions } from '@dskripchenko/terminal'
import { allPanes, findPane, type PaneLeaf, type Workspace } from '../common/layout'
import { api, ui, ws } from './store'
import { allThemes, currentTheme } from './theme'

interface Entry {
  id: string
  profile?: string
  term: Terminal
  view: TerminalView
  host: HTMLDivElement
  exited: boolean
}

const entries = new Map<string, Entry>()

/**
 * A pane's output from before the restart, set apart from what the new shell
 * writes and scrolled up into the scrollback: a shell that clears the screen
 * as it starts (ConPTY on Windows does) cannot wipe it.
 */
function restored(rows: number): string {
  return '\x1b[0m\x1b[?1049l\x1b[?25h\r\n\x1b[2m── вывод до перезапуска ──\x1b[0m' + '\r\n'.repeat(Math.max(1, rows))
}

/** A pane's theme: its profile's, if it names one that exists; else the window's. */
function themeOf(profile?: string) {
  const name = profile ? ui.settings?.config.profiles[profile]?.theme : undefined
  return (name && allThemes().find((t) => t.name === name)) || currentTheme()
}

function options(id: string, profile?: string): TerminalViewOptions {
  const c = ui.settings?.config
  return {
    theme: themeOf(profile),
    fontFamily: c?.font.family,
    fontSize: Math.max(6, (c?.font.size ?? 13) + ui.fontDelta),
    lineHeight: c?.font.lineHeight ?? 1.3,
    onResize: (cols, rows) => api.resize(id, cols, rows),
    onLink: (url) => api.openExternal(url),
  }
}

function spawn(entry: Entry, cwd?: string): void {
  entry.exited = false
  delete ui.exited[entry.id]
  void api.spawn(entry.id, { cwd, cols: entry.term.cols, rows: entry.term.rows, profile: entry.profile }).then((r) => {
    if (!r.ok) {
      entry.term.write(`\r\n\x1b[31mОболочка не запустилась: ${r.error}\x1b[0m\r\n`)
      entry.exited = true
      ui.exited[entry.id] = -1
    }
  })
}

function create(pane: PaneLeaf, replay?: string): Entry {
  const term = new Terminal({ scrollback: ui.settings?.config.scrollback.lines ?? 10000 })
  const host = document.createElement('div')
  host.className = 'term-host'
  host.dataset.pane = pane.id
  const entry: Entry = { id: pane.id, profile: pane.profile, term, view: new TerminalView(term, host, options(pane.id, pane.profile)), host, exited: false }
  entries.set(pane.id, entry)
  term.onData((data) => {
    if (!entry.exited) return api.write(pane.id, data)
    // A shell that ended with an error waits: Enter starts it again.
    if (data === '\r') {
      term.write('\r\n')
      spawn(entry, ui.cwds[pane.id] ?? pane.cwd)
    }
  })
  term.onTitle((title) => (ui.titles[pane.id] = title))
  // A Windows path in a file URL comes as /C:/Users/…: the drive first.
  term.onCwd((cwd) => (ui.cwds[pane.id] = /^\/[A-Za-z]:/.test(cwd) ? cwd.slice(1) : cwd))
  if (replay) term.write(replay + restored(term.rows))
  spawn(entry, pane.cwd)
  return entry
}

let replays: Record<string, string> = {}

export function setReplays(r: Record<string, string>): void {
  replays = r
}

/** The pane's terminal, started the first time it is asked for. */
export function ensure(paneId: string): Entry | null {
  const existing = entries.get(paneId)
  if (existing) return existing
  const pane = ws.value && allPanes(ws.value).find((p) => p.id === paneId)
  if (!pane) return null
  const replay = replays[paneId]
  delete replays[paneId]
  return create(pane, replay)
}

export function get(paneId: string): Entry | undefined {
  return entries.get(paneId)
}

/** Every pane of the workspace started, hidden tabs too: their shells run from the start, as before the restart. */
export function startAll(w: Workspace): void {
  for (const p of allPanes(w)) ensure(p.id)
}

/** Panes no longer in the workspace: their shells ended, their terminals dropped. */
export function prune(w: Workspace): void {
  const keep = new Set(allPanes(w).map((p) => p.id))
  for (const [id, e] of entries) {
    if (keep.has(id)) continue
    e.view.dispose()
    e.host.remove()
    api.kill(id)
    entries.delete(id)
    delete ui.titles[id]
    delete ui.cwds[id]
    delete ui.exited[id]
  }
}

/** The settings or the font size changed: each view drawn again with them (its screen and scrollback kept). */
export function restyle(): void {
  for (const e of entries.values()) {
    const focused = e.host.contains(document.activeElement)
    e.view.dispose()
    e.view = new TerminalView(e.term, e.host, options(e.id, e.profile))
    if (focused) e.view.focus()
  }
}

export function onExit(paneId: string, code: number, close: (paneId: string) => void): void {
  const e = entries.get(paneId)
  if (!e) return
  // A clean end closes the pane, as Terminal.app closes the window; an error stays to be read.
  if (code === 0) {
    close(paneId)
    return
  }
  e.exited = true
  ui.exited[paneId] = code
  e.term.write(`\r\n\x1b[2m[процесс завершён с кодом ${code} — Enter запустит оболочку снова]\x1b[0m\r\n`)
}

/** A pane's whole buffer as text, scrollback included (for the tests). */
export function bufferText(paneId: string): string {
  const t = entries.get(paneId)?.term
  if (!t) return ''
  return Array.from({ length: t.buffer.length }, (_, i) => t.lineText(i)).join('\n')
}

export function write(paneId: string, data: string): void {
  entries.get(paneId)?.term.write(data)
}

export function paneCwd(paneId: string): string | undefined {
  return ui.cwds[paneId] ?? (ws.value ? findPaneIn(ws.value, paneId)?.cwd : undefined)
}

function findPaneIn(w: Workspace, id: string): PaneLeaf | undefined {
  for (const g of w.groups) for (const t of g.tabs) {
    const p = findPane(t.root, id)
    if (p) return p
  }
  return undefined
}
