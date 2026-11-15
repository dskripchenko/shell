/**
 * Updates in the window, as folio shows them: the state from the main process
 * (src/main/update.ts), a check asked for by the person — from the settings or
 * the palette — answered in the status line, the update put in place by a restart.
 */
import type { UpdateInfo, UpdateState } from '../common/ipc'
import { api, say, ui } from './store'
import { m } from './i18n'

/** The person asked for a check: its outcome is said, not only shown. */
let asked = false

/** How far a download is: a percent and megabytes, or the megabytes alone when the size is not known. */
export function progressOf(state: UpdateState): string {
  if (state.status !== 'downloading' || state.received === undefined) return ''
  const mb = (n: number) => (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)
  const unit = m().settings.mb
  if (!state.total) return ` · ${mb(state.received)} ${unit}`
  return ` · ${Math.min(100, Math.floor((state.received / state.total) * 100))}% · ${mb(state.received)} / ${mb(state.total)} ${unit}`
}

/** What a state says in words; null for none (nothing checked yet). */
export function updateText(info: UpdateInfo): string | null {
  const s = m().settings
  const st = info.state
  if (st.status === 'checking') return s.checking
  if (st.status === 'latest') return s.latest
  if (st.status === 'downloading') return s.downloading(st.version, progressOf(st))
  if (st.status === 'ready') return s.ready(st.version)
  if (st.status === 'error') return s.failed(st.error)
  return null
}

export function onUpdateInfo(info: UpdateInfo): void {
  ui.update = info
  if (!asked) return
  const st = info.state.status
  // Progress is on the status bar and in the settings; the outcome is said.
  if (st === 'latest' || st === 'ready' || st === 'error') {
    say(updateText(info)!)
    asked = false
  }
}

export function checkUpdate(): void {
  if (!ui.update?.available) return say(m().settings.devBuild)
  const st = ui.update.state.status
  if (st === 'checking' || st === 'downloading') return
  if (st === 'ready') return say(m().settings.ready((ui.update.state as { version: string }).version))
  asked = true
  say(m().settings.checking)
  api.checkUpdate()
}

export function restartToUpdate(): void {
  if (ui.update?.state.status === 'ready') api.restartToUpdate()
}
