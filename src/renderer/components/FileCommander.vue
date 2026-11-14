<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { joinPath, maskTest, parentOf, shellQuote, sortEntries, type Entry, type PanelState } from '../../common/commander'
import { parseRemote, remoteDir } from '../../common/ssh'
import { activeGroup, activeTab } from '../../common/layout'
import { focusedPane, newNamedTab } from '../commands'
import { typeWhenReady } from '../agents'
import { api, say, ui, ws } from '../store'
import * as terminals from '../terminals'
import FilePanel from './FilePanel.vue'

/** The other panel's folder and the hidden files' showing are kept while shell runs. */
const memory = (window as unknown as { __commander?: { right: string; hidden: boolean } }).__commander ?? { right: '', hidden: false }
;(window as unknown as { __commander: typeof memory }).__commander = memory

const paneId = focusedPane()
const start = terminals.paneCwd(paneId) ?? ui.home
const left = reactive<PanelState>({ dir: start, entries: [], cursor: 0, marked: [], error: '' })
const right = reactive<PanelState>({ dir: memory.right || start, entries: [], cursor: 0, marked: [], error: '' })
const active = ref<'left' | 'right'>('left')
const quick = ref(false)
const view = ref<{ name: string; text: string } | null>(null)
const root = ref<HTMLElement | null>(null)
const windows = ui.os === 'win32'

type Dialog = { kind: 'copy' | 'move' | 'rename' | 'mkdir' | 'delete' | 'mark' | 'unmark'; value: string; items: string[] }
const dialog = ref<Dialog | null>(null)
const dialogInput = ref<HTMLInputElement | null>(null)
const dialogOk = ref<HTMLButtonElement | null>(null)

const cur = () => (active.value === 'left' ? left : right)
const other = () => (active.value === 'left' ? right : left)

/** The folder above, on this computer or on a host (`sftp://host/path`); the top stays itself. */
function up(dir: string): string {
  const r = parseRemote(dir)
  return r ? remoteDir(r.alias, parentOf(r.path)) : parentOf(dir)
}
const lastName = (dir: string) => dir.split(/[\\/]/).filter(Boolean).pop()

async function load(p: PanelState, keepName?: string): Promise<void> {
  const remote = parseRemote(p.dir)
  const r = remote ? await api.remote.list(remote.alias, remote.path) : await api.files.list(p.dir)
  if ('error' in r) {
    p.error = r.error
    p.entries = []
    return
  }
  p.error = ''
  const above: Entry[] = up(p.dir) !== p.dir ? [{ name: '..', kind: 'dir', size: 0, mtime: 0, hidden: false }] : []
  p.entries = [...above, ...sortEntries(r, memory.hidden)]
  p.marked = p.marked.filter((n) => p.entries.some((e) => e.name === n))
  const at = keepName ? p.entries.findIndex((e) => e.name === keepName) : -1
  p.cursor = at >= 0 ? at : Math.min(p.cursor, Math.max(0, p.entries.length - 1))
}

async function go(p: PanelState, dir: string, select?: string): Promise<void> {
  p.dir = dir
  p.cursor = 0
  p.marked = []
  await load(p, select)
  if (p === right) memory.right = dir
}

/** Into a folder, or up with `..`; a file: shown in the quick view. */
async function open(p: PanelState, i: number): Promise<void> {
  const e = p.entries[i]
  if (!e) return
  if (e.name === '..') return go(p, up(p.dir), lastName(p.dir))
  if (e.kind === 'dir' || e.linkToDir) return go(p, joinPath(p.dir, e.name))
  // A file: in the viewer beside the panels (F3 shows its start in the other panel); a host's, brought here first.
  const local = await localCopy(joinPath(p.dir, e.name))
  if (local) ui.viewer = { path: local }
}

/** A file to read here: itself, or a host's brought into a temporary folder. */
async function localCopy(full: string): Promise<string | null> {
  const r = parseRemote(full)
  if (!r) return full
  const f = await api.remote.fetch(r.alias, r.path)
  if ('error' in f) {
    say(`Не скачан: ${f.error}`)
    return null
  }
  return f.local
}

/** The items F5, F6, F8 act on: the marked ones, else the one under the cursor. */
function items(p: PanelState): string[] {
  if (p.marked.length) return p.marked.map((n) => joinPath(p.dir, n))
  const e = p.entries[p.cursor]
  return e && e.name !== '..' ? [joinPath(p.dir, e.name)] : []
}

async function showQuick(): Promise<void> {
  const p = cur()
  const e = p.entries[p.cursor]
  if (!quick.value || !e || e.name === '..' || e.kind === 'dir' || e.linkToDir) {
    view.value = e && quick.value ? { name: e.name, text: e.name === '..' ? '' : 'Папка' } : null
    return
  }
  const local = await localCopy(joinPath(p.dir, e.name))
  if (!local) return
  const r = await api.files.head(local)
  view.value = { name: e.name, text: 'error' in r ? r.error : 'binary' in r ? `Двоичный файл, ${r.size} байт` : r.text + (r.truncated ? '\n…' : '') }
}

async function refreshBoth(): Promise<void> {
  await Promise.all([load(left), load(right)])
}

function report(r: { done: string[]; failed: { path: string; error: string }[] }, what: string): void {
  say(r.failed.length ? `${what}: ${r.done.length}, не вышло: ${r.failed.map((f) => `${f.path.split(/[\\/]/).pop()} — ${f.error}`).join('; ')}` : `${what}: ${r.done.length}`)
}

async function confirm(): Promise<void> {
  const reactiveDialog = dialog.value
  if (!reactiveDialog) return
  dialog.value = null
  // The keys back on the panels at once, not when the work is done (over sftp it takes seconds).
  root.value?.focus()
  // Plain values for IPC: a reactive array cannot be cloned across.
  const d: Dialog = { kind: reactiveDialog.kind, value: reactiveDialog.value, items: [...reactiveDialog.items] }
  try {
    await run(d)
  } catch (e) {
    say(`Не вышло: ${e instanceof Error ? e.message : String(e)}`)
  }
  root.value?.focus()
}

/** Items copied (and, for a move, then removed) between this computer and a host, in either direction. */
async function transfer(itemsIn: string[], target: string, move: boolean): Promise<void> {
  const from = parseRemote(itemsIn[0] ?? '')
  const to = parseRemote(target)
  if (from && to) return say('Между двумя хостами — через этот компьютер: скопируйте сюда, потом туда')
  if (!from && !to) return report(move ? await api.files.move(itemsIn, target) : await api.files.copy(itemsIn, target), move ? 'Перенесено' : 'Скопировано')
  const r = from ? await api.remote.get(from.alias, itemsIn.map((i) => parseRemote(i)!.path), target) : await api.remote.put(to!.alias, itemsIn, to!.path)
  if (move && r.done.length) {
    const moved = itemsIn.filter((_, i) => !r.failed.some((f) => f.path === (from ? parseRemote(itemsIn[i]!)!.path : itemsIn[i])))
    if (from) await api.remote.remove(from.alias, moved.map((i) => ({ path: parseRemote(i)!.path, dir: kindOf(i) === 'dir' })))
    else await api.files.trash(moved)
  }
  report(r, move ? 'Перенесено' : 'Скопировано')
}

/** Whether a path of the active panel is a folder. */
function kindOf(full: string): Entry['kind'] | undefined {
  const name = full.split('/').pop()
  return cur().entries.find((e) => e.name === name)?.kind
}

async function run(d: Dialog): Promise<void> {
  const p = cur()
  const remote = parseRemote(p.dir)
  if (d.kind === 'copy') await transfer(d.items, d.value, false)
  else if (d.kind === 'move') await transfer(d.items, d.value, true)
  else if (d.kind === 'rename') {
    const err = remote
      ? await api.remote.rename(remote.alias, parseRemote(d.items[0]!)!.path, d.value.startsWith('/') ? d.value : `${remote.path.replace(/\/$/, '')}/${d.value}`)
      : await api.files.rename(d.items[0]!, /^([A-Za-z]:)?[\\/]/.test(d.value) ? d.value : joinPath(p.dir, d.value))
    say(err ? `Не переименовано: ${err}` : 'Переименовано')
  } else if (d.kind === 'mkdir') {
    const err = remote ? await api.remote.mkdir(remote.alias, `${remote.path.replace(/\/$/, '')}/${d.value}`) : await api.files.mkdir(joinPath(p.dir, d.value))
    say(err ? `Папка не создана: ${err}` : `Создана папка ${d.value}`)
    await load(p, d.value)
  } else if (d.kind === 'delete') {
    if (remote) report(await api.remote.remove(remote.alias, d.items.map((i) => ({ path: parseRemote(i)!.path, dir: kindOf(i) === 'dir' }))), 'Удалено')
    else report(await api.files.trash(d.items), 'В корзине')
  }
  else if (d.kind === 'mark' || d.kind === 'unmark') {
    const test = maskTest(d.value)
    const names = p.entries.filter((e) => e.name !== '..' && test(e.name)).map((e) => e.name)
    p.marked = d.kind === 'mark' ? [...new Set([...p.marked, ...names])] : p.marked.filter((n) => !names.includes(n))
  }
  if (d.kind !== 'mark' && d.kind !== 'unmark') {
    cur().marked = []
    await refreshBoth()
  }
}

function ask(kind: Dialog['kind'], value: string, list: string[] = []): void {
  dialog.value = { kind, value, items: list }
  void nextTick(() => {
    // A dialog with nothing to type (delete): Enter on its button.
    if (!dialogInput.value) return dialogOk.value?.focus()
    dialogInput.value.focus()
    dialogInput.value.select()
  })
}

/** Closing: the shell goes to the active panel's folder, as MC's does — if it waits at its prompt. */
function close(): void {
  ui.commander = false
  const dir = cur().dir
  const shellAt = terminals.paneCwd(paneId)
  if (dir && !parseRemote(dir) && dir !== shellAt && ui.busy[paneId] === false) {
    api.write(paneId, windows ? `Set-Location -LiteralPath ${shellQuote(dir, true)}\r` : ` cd -- ${shellQuote(dir, false)}\r`)
  }
}

function editInTab(path: string): void {
  const command = windows ? `notepad ${shellQuote(path, true)}` : `\${EDITOR:-vi} ${shellQuote(path, false)}`
  const tabPane = newNamedTab(path.split(/[\\/]/).pop() ?? 'правка', parentOf(path))
  typeWhenReady(tabPane, command)
  ui.commander = false
}

async function key(e: KeyboardEvent): Promise<void> {
  if (dialog.value || places.value) return
  const p = cur()
  const n = p.entries.length
  const move = (to: number) => {
    p.cursor = Math.max(0, Math.min(n - 1, to))
    if (quick.value) void showQuick()
  }
  const page = 15
  switch (e.key) {
    case 'ArrowDown': move(p.cursor + 1); break
    case 'ArrowUp': move(p.cursor - 1); break
    case 'PageDown': move(p.cursor + page); break
    case 'PageUp': move(p.cursor - page); break
    case 'Home': move(0); break
    case 'End': move(n - 1); break
    case 'Enter': await open(p, p.cursor); break
    case 'Backspace': if (up(p.dir) !== p.dir) await go(p, up(p.dir), lastName(p.dir)); break
    case 'Tab':
      active.value = active.value === 'left' ? 'right' : 'left'
      if (quick.value) quick.value = false
      view.value = null
      break
    case 'Insert':
    case ' ': {
      const entry = p.entries[p.cursor]
      if (entry && entry.name !== '..') p.marked = p.marked.includes(entry.name) ? p.marked.filter((x) => x !== entry.name) : [...p.marked, entry.name]
      move(p.cursor + 1)
      break
    }
    case '+': ask('mark', '*'); break
    case '-': ask('unmark', '*'); break
    case '*': p.marked = p.entries.filter((x) => x.name !== '..' && !p.marked.includes(x.name)).map((x) => x.name); break
    case 'F3':
      quick.value = !quick.value
      await showQuick()
      break
    case 'F4': {
      const entry = p.entries[p.cursor]
      if (parseRemote(p.dir)) say('Файлы хоста правятся на нём: откройте SSH во вкладке')
      else if (entry && entry.kind === 'file') editInTab(joinPath(p.dir, entry.name))
      break
    }
    case 'F5': if (items(p).length) ask('copy', other().dir, items(p)); break
    case 'F6': {
      const list = items(p)
      if (list.length === 1 && !p.marked.length) ask('rename', p.entries[p.cursor]!.name, list)
      else if (list.length) ask('move', other().dir, list)
      break
    }
    case 'F7': ask('mkdir', ''); break
    case 'F8': if (items(p).length) ask('delete', '', items(p)); break
    case 'F10':
    case 'Escape': close(); break
    default:
      if (e.altKey && e.code === 'Period') {
        memory.hidden = !memory.hidden
        await refreshBoth()
        break
      }
      // Ctrl+\\, as MC's hotlist: the places to go — home, the groups' folders, the SSH hosts.
      if (e.ctrlKey && e.code === 'Backslash') {
        await openPlaces()
        break
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') {
        await refreshBoth()
        break
      }
      return
  }
  e.preventDefault()
}

const KEYS: [string, string, () => void][] = [
  ['F3', 'Просмотр', () => void key(new KeyboardEvent('keydown', { key: 'F3' }))],
  ['F4', 'Правка', () => void key(new KeyboardEvent('keydown', { key: 'F4' }))],
  ['F5', 'Копия', () => void key(new KeyboardEvent('keydown', { key: 'F5' }))],
  ['F6', 'Перенос', () => void key(new KeyboardEvent('keydown', { key: 'F6' }))],
  ['F7', 'Папка', () => void key(new KeyboardEvent('keydown', { key: 'F7' }))],
  ['F8', 'Удалить', () => void key(new KeyboardEvent('keydown', { key: 'F8' }))],
  ['F10', 'Выход', () => close()],
]

/** Places: where a panel can go in one step. */
interface Place {
  label: string
  note: string
  dir?: string
  host?: string
}
const places = ref<Place[] | null>(null)
const placeAt = ref(0)
const placesList = ref<HTMLElement | null>(null)

async function openPlaces(): Promise<void> {
  const list: Place[] = [{ label: 'Домашняя папка', note: ui.home, dir: ui.home }]
  for (const g of ws.value!.groups) if (g.cwd && !list.some((x) => x.dir === g.cwd)) list.push({ label: g.name, note: g.cwd, dir: g.cwd })
  for (const h of await api.remote.hosts()) list.push({ label: h.alias, note: `SSH${h.user ? ` · ${h.user}@` : ' · '}${h.hostname ?? h.alias}`, host: h.alias })
  places.value = list
  placeAt.value = 0
  void nextTick(() => placesList.value?.focus())
}

async function goPlace(pl: Place): Promise<void> {
  places.value = null
  root.value?.focus()
  const p = cur()
  if (pl.dir) return go(p, pl.dir)
  if (!pl.host) return
  say(`Подключение к ${pl.host}…`)
  const home = await api.remote.home(pl.host)
  if ('error' in home) return say(`${pl.host}: ${home.error}`)
  say('')
  await go(p, remoteDir(pl.host, home.path))
}

function placesKey(e: KeyboardEvent): void {
  const list = places.value ?? []
  if (e.key === 'ArrowDown') placeAt.value = Math.min(list.length - 1, placeAt.value + 1)
  else if (e.key === 'ArrowUp') placeAt.value = Math.max(0, placeAt.value - 1)
  else if (e.key === 'Enter' && list[placeAt.value]) void goPlace(list[placeAt.value]!)
  else if (e.key === 'Escape') {
    places.value = null
    root.value?.focus()
  } else return
  e.preventDefault()
  e.stopPropagation()
}

const TITLES: Record<Dialog['kind'], string> = { copy: 'Копировать в', move: 'Перенести в', rename: 'Новое имя', mkdir: 'Новая папка', delete: 'В корзину', mark: 'Выделить по маске', unmark: 'Снять выделение по маске' }
const dialogNote = computed(() => {
  const d = dialog.value
  if (!d) return ''
  const names = d.items.map((x) => x.split(/[\\/]/).pop())
  if (d.kind === 'delete' && parseRemote(cur().dir)) return `${names.length === 1 ? `«${names[0]}»` : `${names.length} объектов`} — удалить на хосте навсегда (корзины там нет)`
  if (d.kind === 'delete') return names.length === 1 ? `«${names[0]}» уйдёт в корзину` : `${names.length} объектов уйдут в корзину`
  if (d.kind === 'copy' || d.kind === 'move') return names.length === 1 ? `«${names[0]}»` : `${names.length} объектов`
  return ''
})

/** The keys stay with the panels: focus that leaves them for nowhere (a panel redrawn) comes back. */
function keepFocus(e: FocusEvent): void {
  const to = e.relatedTarget as Node | null
  if (dialog.value || places.value || (to && root.value?.contains(to))) return
  void nextTick(() => {
    if (ui.commander && !dialog.value && (!document.activeElement || document.activeElement === document.body)) root.value?.focus()
  })
}

onMounted(async () => {
  await refreshBoth()
  root.value?.focus()
})
onBeforeUnmount(() => {
  memory.right = right.dir
  void nextTick(() => terminals.get(activeTab(activeGroup(ws.value!)).focus)?.view.focus())
})
</script>

<template>
  <div ref="root" class="commander" tabindex="-1" role="application" aria-label="Файловые панели" @keydown="key" @focusout="keepFocus">
    <div class="commander-panels">
      <FilePanel :panel="left" :active="active === 'left'" label="Левая панель" @pick="(i) => { active = 'left'; left.cursor = i }" @open="(i) => open(left, i)" />
      <section v-if="quick && active === 'left'" class="fpanel quick" aria-label="Быстрый просмотр">
        <header class="fpanel-head mono">{{ view?.name ?? '' }}</header>
        <pre class="quick-text">{{ view?.text ?? '' }}</pre>
      </section>
      <FilePanel v-else :panel="right" :active="active === 'right'" label="Правая панель" @pick="(i) => { active = 'right'; right.cursor = i }" @open="(i) => open(right, i)" />
    </div>
    <nav class="commander-keys" aria-label="Функциональные клавиши">
      <button v-for="[k, label, act] in KEYS" :key="k" type="button" class="fkey" @click="act()"><kbd>{{ k }}</kbd>{{ label }}</button>
    </nav>
    <div v-if="places" class="overlay commander-overlay" @pointerdown.self="places = null; root?.focus()">
      <div class="palette places" role="dialog" aria-label="Места">
        <div class="palette-input"><span>Места</span><span class="palette-section">Ctrl+\\ · Enter — перейти</span></div>
        <div ref="placesList" class="palette-list" role="listbox" tabindex="0" aria-label="Места" @keydown="placesKey">
          <div v-for="(pl, i) in places" :key="pl.label + pl.note" class="palette-item" role="option" :aria-selected="i === placeAt" @pointermove="placeAt = i" @click="goPlace(pl)">
            <span class="palette-title">{{ pl.label }}</span>
            <span class="palette-section mono">{{ pl.note }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="dialog" class="overlay commander-overlay" @pointerdown.self="dialog = null">
      <form class="dialog" role="dialog" :aria-label="TITLES[dialog.kind]" @submit.prevent="confirm" @keydown.esc.prevent.stop="dialog = null; root?.focus()">
        <h2>{{ TITLES[dialog.kind] }}</h2>
        <p v-if="dialogNote" class="dialog-hint">{{ dialogNote }}</p>
        <input v-if="dialog.kind !== 'delete'" ref="dialogInput" v-model="dialog.value" aria-label="Значение" class="mono" />
        <div class="dialog-actions">
          <button type="button" class="button" @click="dialog = null; root?.focus()">Отмена</button>
          <button ref="dialogOk" type="submit" class="button primary">{{ dialog.kind === 'delete' ? 'Удалить' : 'Готово' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
