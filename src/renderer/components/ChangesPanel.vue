<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BookOpen, GitCompare, RefreshCw, X } from '@dskripchenko/ui/icons'
import { addedFile, commentFor, parseDiff, type DiffLine } from '../../common/diff'
import { activeGroup, activeTab, findPane, panes } from '../../common/layout'
import type { Baseline, ChangedFile, RepoEdit } from '../../common/ipc'
import { tabTitle } from '../titles'
import { keysOf } from '../keyboard'
import { api, say, shortPath, toFolio, ui, ws } from '../store'
import * as terminals from '../terminals'

/** The pane whose agent's changes are shown: the focused one, or the tab's pane running an agent. */
const paneId = computed(() => {
  const tab = activeTab(activeGroup(ws.value!))
  if (ui.agents[tab.focus] || ui.baselines[tab.focus]) return tab.focus
  return panes(tab.root).find((p) => ui.agents[p.id])?.id ?? tab.focus
})
const agent = computed(() => ui.agents[paneId.value])

const baseline = ref<Baseline | null>(null)
const files = ref<ChangedFile[]>([])
const error = ref('')
const selected = ref<string | null>(null)
const lines = ref<DiffLine[]>([])
const diffError = ref('')
const commentAt = ref<number | null>(null)
/** The agents' edits in the repository (the journal shared with folio), the last for each file. */
const edits = ref<Map<string, RepoEdit>>(new Map())
const mineOnly = ref(false)
const comment = ref('')

/** The agent's baseline, or the working copy against HEAD when no agent started one. */
async function resolveBaseline(): Promise<void> {
  const own = ui.baselines[paneId.value]
  if (own) {
    baseline.value = own
    return
  }
  const cwd = terminals.paneCwd(paneId.value)
  baseline.value = cwd ? await api.changesBaseline(cwd, 'head') : null
}

async function refresh(): Promise<void> {
  if (!baseline.value) await resolveBaseline()
  const b = baseline.value
  if (!b) {
    files.value = []
    error.value = 'Папка панели — не репозиторий git'
    return
  }
  const r = await api.changesList(JSON.parse(JSON.stringify(b)))
  if ('error' in r) {
    error.value = r.error
    files.value = []
    return
  }
  error.value = ''
  const journal = await api.changesEdits(JSON.parse(JSON.stringify(b)))
  edits.value = new Map(journal.map((e) => [e.path, e]))
  files.value = r
  if (selected.value && !r.some((f) => f.path === selected.value)) selected.value = null
  if (!selected.value && r[0]) await select(r[0])
  else if (selected.value) await loadDiff()
}

async function loadDiff(): Promise<void> {
  const b = baseline.value
  const f = files.value.find((x) => x.path === selected.value)
  if (!b || !f) {
    lines.value = []
    return
  }
  const r = await api.changesDiff(JSON.parse(JSON.stringify(b)), f.path, !!f.untracked)
  diffError.value = 'error' in r ? r.error : ''
  lines.value = 'diff' in r ? parseDiff(r.diff) : 'text' in r ? addedFile(r.text) : []
}

async function select(f: ChangedFile): Promise<void> {
  selected.value = f.path
  commentAt.value = null
  await loadDiff()
}

/** A file is viewed while it stays as it was when marked. */
const key = (f: ChangedFile) => `${baseline.value?.root}|${baseline.value?.base}|${f.path}`
const sign = (f: ChangedFile) => `${f.status}:${f.adds}:${f.dels}`
const isViewed = (f: ChangedFile) => ui.viewed[key(f)] === sign(f)
function toggleViewed(f: ChangedFile): void {
  if (isViewed(f)) delete ui.viewed[key(f)]
  else ui.viewed[key(f)] = sign(f)
}
const totals = computed(() => ({ adds: files.value.reduce((a, f) => a + f.adds, 0), dels: files.value.reduce((a, f) => a + f.dels, 0), viewed: files.value.filter(isViewed).length }))

function openComment(i: number): void {
  if (lines.value[i]?.kind === 'hunk') return
  commentAt.value = i
  comment.value = ''
}

/** The comment pasted into the agent's pane as `file:line — text`, without Enter: the person sends it. */
function send(): void {
  const line = commentAt.value !== null ? lines.value[commentAt.value] : null
  const e = terminals.get(paneId.value)
  if (!line || !selected.value || !comment.value.trim() || !e) return
  e.view.scrollToBottom()
  e.term.paste(commentFor(selected.value, line, comment.value) + ' ')
  commentAt.value = null
  say('Комментарий вставлен в панель агента — отправьте его там')
  e.view.focus()
}

let timer: number | undefined
onMounted(() => {
  void refresh()
  timer = window.setInterval(() => void refresh(), 2000)
})
onBeforeUnmount(() => window.clearInterval(timer))
watch(paneId, () => {
  baseline.value = null
  selected.value = null
  void refresh()
})
watch(
  () => ui.baselines[paneId.value],
  () => {
    baseline.value = null
    void refresh()
  },
)

/** The selected file in folio, at the line commented on or the first changed one. */
function fileToFolio(): void {
  const b = baseline.value
  const f = files.value.find((x) => x.path === selected.value)
  if (!b || !f || f.status === 'deleted') return
  const at = commentAt.value !== null ? lines.value[commentAt.value] : lines.value.find((l) => l.kind === 'add')
  const sep = b.root.includes('\\') ? '\\' : '/'
  toFolio({ file: { path: b.root + sep + f.path.split('/').join(sep), ...(at?.new ? { line: at.new } : {}) } })
}

/** Who edited a file last, as the journal says: this pane's agent, another tab's, one outside shell. */
function editor(f: ChangedFile): { label: string; title: string; mine: boolean } | null {
  const e = edits.value.get(f.path)
  if (!e) return null
  const at = new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (e.pane && e.pane === paneId.value) return { label: 'этот агент', title: `Правил агент этой панели (${e.tool}, ${at})`, mine: true }
  if (e.pane) {
    const tab = ws.value!.groups.flatMap((g) => g.tabs).find((t) => findPane(t.root, e.pane))
    const name = tab ? tabTitle(tab) : 'закрытая вкладка'
    return { label: name, title: `Правил агент во вкладке «${name}» (${e.tool}, ${at})`, mine: false }
  }
  return { label: 'вне shell', title: `Правил агент вне shell, сессия ${e.session.slice(0, 8)} (${e.tool}, ${at})`, mine: false }
}
const hasMine = computed(() => files.value.some((f) => edits.value.get(f.path)?.pane === paneId.value))
const shown = computed(() => (mineOnly.value && hasMine.value ? files.value.filter((f) => edits.value.get(f.path)?.pane === paneId.value) : files.value))

const STATUS = { added: 'A', modified: 'M', deleted: 'D' } as const
</script>

<template>
  <aside class="changes" aria-label="Изменения агента">
    <header class="changes-head">
      <span class="changes-title">Изменения</span>
      <span class="changes-sub">{{ agent ? `${agent.name}, с начала сессии` : 'рабочая копия к HEAD' }}</span>
      <span class="changes-fill"></span>
      <span v-if="files.length" class="changes-count"><span class="plus">+{{ totals.adds }}</span> <span class="minus">−{{ totals.dels }}</span> · {{ totals.viewed }}/{{ files.length }}</span>
      <template v-if="ui.folio && baseline">
        <button type="button" class="icon-button" aria-label="Ревью в folio" title="Ревью в folio" @click="toFolio({ review: baseline.root })"><GitCompare :size="14" aria-hidden="true" /></button>
        <button v-if="selected" type="button" class="icon-button" aria-label="Открыть файл в folio" title="Открыть файл в folio" @click="fileToFolio()"><BookOpen :size="14" aria-hidden="true" /></button>
      </template>
      <button type="button" class="icon-button" aria-label="Обновить" title="Обновить" @click="refresh()"><RefreshCw :size="14" aria-hidden="true" /></button>
      <button type="button" class="icon-button" :aria-label="`Скрыть ${keysOf('changes.toggle')}`" :title="`Скрыть ${keysOf('changes.toggle')}`" @click="ui.changesOpen = false"><X :size="14" aria-hidden="true" /></button>
    </header>
    <div v-if="baseline" class="changes-root mono" :title="baseline.root">{{ shortPath(baseline.root) }}</div>
    <div v-if="error" class="changes-empty">{{ error }}</div>
    <div v-else-if="files.length === 0" class="changes-empty">Изменений нет</div>
    <div v-else class="changes-body">
      <ul class="changes-files" role="listbox" aria-label="Изменённые файлы">
        <li v-if="hasMine" class="changes-filter" role="none"><label><input v-model="mineOnly" type="checkbox" /> Только правки этого агента</label></li>
        <li v-for="f in shown" :key="f.path" class="changes-file" :class="{ active: f.path === selected }" role="option" :aria-selected="f.path === selected" title="Двойной щелчок — открыть в просмотре" @click="select(f)" @dblclick="f.status !== 'deleted' && baseline && (ui.viewer = { path: f.path, cwd: baseline.root })">
          <span class="file-status" :class="f.status">{{ STATUS[f.status] }}</span>
          <span class="file-path mono" :title="f.path">{{ f.path }}</span>
          <span v-if="editor(f)" class="file-editor" :class="{ mine: editor(f)!.mine }" :title="editor(f)!.title">{{ editor(f)!.label }}</span>
          <span class="plus mono">{{ f.adds ? `+${f.adds}` : '' }}</span>
          <span class="minus mono">{{ f.dels ? `−${f.dels}` : '' }}</span>
          <input type="checkbox" class="file-viewed" :checked="isViewed(f)" :aria-label="`Просмотрено: ${f.path}`" title="Просмотрено" @click.stop="toggleViewed(f)" />
        </li>
      </ul>
      <div class="changes-diff" role="region" :aria-label="`Diff: ${selected ?? ''}`">
        <div v-if="diffError" class="changes-empty">{{ diffError }}</div>
        <template v-for="(l, i) in lines" :key="i">
          <div class="diff-line" :class="l.kind" :title="l.kind === 'hunk' ? '' : 'Щелчок — комментарий агенту к этой строке'" @click="openComment(i)">
            <span class="diff-no">{{ l.old ?? '' }}</span>
            <span class="diff-no">{{ l.new ?? '' }}</span>
            <span class="diff-sign">{{ l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : '' }}</span>
            <span class="diff-text">{{ l.text }}</span>
          </div>
          <form v-if="commentAt === i" class="diff-comment" @submit.prevent="send" @keydown.esc.prevent="commentAt = null">
            <label :for="`comment-${i}`">Комментарий к строке {{ l.new ?? l.old }} — уйдёт агенту в консоль</label>
            <textarea :id="`comment-${i}`" v-model="comment" rows="2" autofocus @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send"></textarea>
            <div class="diff-comment-actions">
              <button type="button" class="button" @click="commentAt = null">Отмена</button>
              <button type="submit" class="button primary">Отправить агенту</button>
            </div>
          </form>
        </template>
      </div>
    </div>
  </aside>
</template>
