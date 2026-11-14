<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, RefreshCw, X } from '@dskripchenko/ui/icons'
import { joinPath, sortEntries, type Entry } from '../../common/commander'
import { activeGroup, activeTab } from '../../common/layout'
import { keysOf } from '../keyboard'
import { api, say, shortPath, ui, ws } from '../store'
import * as terminals from '../terminals'
import { m } from '../i18n'

/**
 * The project's tree beside the panes: the focused pane's repository (or its
 * folder), folders opened as they are clicked, files git sees changed marked.
 * Enter or a double click shows a file in the viewer; Cmd/Ctrl+Enter on a
 * folder takes the pane there (when its shell waits at the prompt).
 */
interface Row {
  path: string
  name: string
  depth: number
  dir: boolean
  hidden: boolean
}

const root = ref<string | null>(null)
const open = ref(new Set<string>())
const children = ref(new Map<string, Entry[]>())
const changed = ref(new Set<string>())
const at = ref(0)
const list = ref<HTMLElement | null>(null)
const paneId = computed(() => (ws.value ? activeTab(activeGroup(ws.value)).focus : ''))
const sep = computed(() => (root.value && root.value.includes('\\') && !root.value.includes('/') ? '\\' : '/'))

async function load(dir: string): Promise<void> {
  const r = await api.files.list(dir)
  const next = new Map(children.value)
  next.set(dir, 'error' in r ? [] : sortEntries(r.filter((e) => e.name !== '.git'), true))
  children.value = next
}

/** The root: the focused pane's repository, else its folder. */
async function locate(): Promise<void> {
  const cwd = terminals.paneCwd(paneId.value) ?? ui.home
  const repo = (await api.changesBaseline(cwd, 'head'))?.root ?? cwd
  if (repo === root.value) return
  root.value = repo
  open.value = new Set([repo])
  children.value = new Map()
  at.value = 0
  await load(repo)
  await marks()
}

/** Files git sees changed (to HEAD), and the folders they are in. */
async function marks(): Promise<void> {
  if (!root.value) return
  const b = await api.changesBaseline(root.value, 'head')
  if (!b) return void (changed.value = new Set())
  const r = await api.changesList(JSON.parse(JSON.stringify(b)))
  const set = new Set<string>()
  if (!('error' in r)) {
    for (const f of r) {
      const parts = f.path.split('/')
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'))
    }
  }
  changed.value = set
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (dir: string, depth: number) => {
    for (const e of children.value.get(dir) ?? []) {
      const path = joinPath(dir, e.name)
      const isDir = e.kind === 'dir' || !!e.linkToDir
      out.push({ path, name: e.name, depth, dir: isDir, hidden: e.hidden })
      if (isDir && open.value.has(path)) walk(path, depth + 1)
    }
  }
  if (root.value) walk(root.value, 0)
  return out
})

/** A path from the root, `/`-separated (as git says them). */
const rel = (path: string) => (root.value ? path.slice(root.value.length + 1).split(sep.value).join('/') : path)

async function toggle(r: Row): Promise<void> {
  const next = new Set(open.value)
  if (next.has(r.path)) next.delete(r.path)
  else {
    next.add(r.path)
    if (!children.value.has(r.path)) await load(r.path)
  }
  open.value = next
}

async function activate(r: Row, cd = false): Promise<void> {
  if (r.dir && cd) {
    if (ui.busy[paneId.value]) return say(m().common.busyRetry)
    api.write(paneId.value, ui.os === 'win32' ? `Set-Location -LiteralPath '${r.path.replace(/'/g, "''")}'\r` : ` cd -- '${r.path.replace(/'/g, `'\\''`)}'\r`)
    return
  }
  if (r.dir) return toggle(r)
  ui.viewer = { path: r.path }
}

function key(e: KeyboardEvent): void {
  const r = rows.value[at.value]
  const n = rows.value.length
  if (e.key === 'ArrowDown') at.value = Math.min(n - 1, at.value + 1)
  else if (e.key === 'ArrowUp') at.value = Math.max(0, at.value - 1)
  else if (e.key === 'ArrowRight' && r?.dir && !open.value.has(r.path)) void toggle(r)
  else if (e.key === 'ArrowLeft' && r?.dir && open.value.has(r.path)) void toggle(r)
  else if (e.key === 'Enter' && r) void activate(r, e.metaKey || e.ctrlKey)
  else if (e.key === 'Escape') terminals.get(paneId.value)?.view.focus()
  else return
  e.preventDefault()
  void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}

async function refresh(): Promise<void> {
  for (const dir of [...children.value.keys()]) await load(dir)
  await marks()
}

let timer: number | undefined
onMounted(() => {
  void locate()
  timer = window.setInterval(() => void marks(), 5000)
})
onBeforeUnmount(() => window.clearInterval(timer))
watch(paneId, () => void locate())
watch(() => ui.cwds[paneId.value], () => void locate())
</script>

<template>
  <aside class="project-tree" :aria-label="m().tree.label">
    <header class="changes-head">
      <span class="changes-title">{{ m().tree.title }}</span>
      <span class="changes-sub mono" :title="root ?? ''">{{ root ? shortPath(root) : '' }}</span>
      <span class="changes-fill"></span>
      <button type="button" class="icon-button" :aria-label="m().common.refresh" :title="m().common.refresh" @click="refresh()"><RefreshCw :size="14" aria-hidden="true" /></button>
      <button type="button" class="icon-button" :aria-label="m().common.hide(keysOf('tree.toggle'))" :title="m().common.hide(keysOf('tree.toggle'))" @click="ui.treeOpen = false"><X :size="14" aria-hidden="true" /></button>
    </header>
    <div ref="list" class="tree-list mono" role="tree" tabindex="0" :aria-label="m().tree.files" @keydown="key">
      <div
        v-for="(r, i) in rows"
        :key="r.path"
        class="tree-row"
        role="treeitem"
        :aria-selected="i === at"
        :aria-expanded="r.dir ? open.has(r.path) : undefined"
        :class="{ current: i === at, hiddenFile: r.hidden, changed: changed.has(rel(r.path)) }"
        :style="{ paddingLeft: `${8 + r.depth * 14}px` }"
        :title="r.dir ? m().tree.dirTip(r.name) : m().tree.fileTip(r.name)"
        @click="at = i; r.dir && toggle(r)"
        @dblclick="!r.dir && activate(r)"
      >
        <component :is="open.has(r.path) ? ChevronDown : ChevronRight" v-if="r.dir" :size="12" aria-hidden="true" />
        <span v-else class="tree-pad" aria-hidden="true"></span>
        <span class="tree-name">{{ r.name }}</span>
      </div>
    </div>
  </aside>
</template>
