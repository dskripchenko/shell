<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { joinPath, maskTest, parentOf, shellQuote, sortEntries, type Entry, type PanelState } from '../../common/commander'
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

async function load(p: PanelState, keepName?: string): Promise<void> {
  const r = await api.files.list(p.dir)
  if ('error' in r) {
    p.error = r.error
    p.entries = []
    return
  }
  p.error = ''
  const up: Entry[] = parentOf(p.dir) !== p.dir ? [{ name: '..', kind: 'dir', size: 0, mtime: 0, hidden: false }] : []
  p.entries = [...up, ...sortEntries(r, memory.hidden)]
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
  if (e.name === '..') return go(p, parentOf(p.dir), p.dir.split(/[\\/]/).filter(Boolean).pop())
  if (e.kind === 'dir' || e.linkToDir) return go(p, joinPath(p.dir, e.name))
  quick.value = true
  await showQuick()
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
  const r = await api.files.head(joinPath(p.dir, e.name))
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
  // Plain values for IPC: a reactive array cannot be cloned across.
  const d: Dialog = { kind: reactiveDialog.kind, value: reactiveDialog.value, items: [...reactiveDialog.items] }
  try {
    await run(d)
  } catch (e) {
    say(`Не вышло: ${e instanceof Error ? e.message : String(e)}`)
  }
  root.value?.focus()
}

async function run(d: Dialog): Promise<void> {
  const p = cur()
  if (d.kind === 'copy') report(await api.files.copy(d.items, d.value), 'Скопировано')
  else if (d.kind === 'move') report(await api.files.move(d.items, d.value), 'Перенесено')
  else if (d.kind === 'rename') {
    const to = /^([A-Za-z]:)?[\\/]/.test(d.value) ? d.value : joinPath(p.dir, d.value)
    const err = await api.files.rename(d.items[0]!, to)
    say(err ? `Не переименовано: ${err}` : 'Переименовано')
  } else if (d.kind === 'mkdir') {
    const err = await api.files.mkdir(joinPath(p.dir, d.value))
    say(err ? `Папка не создана: ${err}` : `Создана папка ${d.value}`)
    await load(p, d.value)
  } else if (d.kind === 'delete') report(await api.files.trash(d.items), 'В корзине')
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
  if (dir && dir !== shellAt && ui.busy[paneId] === false) {
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
  if (dialog.value) return
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
    case 'Backspace': if (parentOf(p.dir) !== p.dir) await go(p, parentOf(p.dir), p.dir.split(/[\\/]/).filter(Boolean).pop()); break
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
      if (entry && entry.kind === 'file') editInTab(joinPath(p.dir, entry.name))
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

const TITLES: Record<Dialog['kind'], string> = { copy: 'Копировать в', move: 'Перенести в', rename: 'Новое имя', mkdir: 'Новая папка', delete: 'В корзину', mark: 'Выделить по маске', unmark: 'Снять выделение по маске' }
const dialogNote = computed(() => {
  const d = dialog.value
  if (!d) return ''
  const names = d.items.map((x) => x.split(/[\\/]/).pop())
  if (d.kind === 'delete') return names.length === 1 ? `«${names[0]}» уйдёт в корзину` : `${names.length} объектов уйдут в корзину`
  if (d.kind === 'copy' || d.kind === 'move') return names.length === 1 ? `«${names[0]}»` : `${names.length} объектов`
  return ''
})

/** The keys stay with the panels: focus that leaves them for nowhere (a panel redrawn) comes back. */
function keepFocus(e: FocusEvent): void {
  const to = e.relatedTarget as Node | null
  if (dialog.value || (to && root.value?.contains(to))) return
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
