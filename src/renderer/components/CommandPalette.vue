<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Search } from '@dskripchenko/ui/icons'
import { fuzzy } from '../../common/fuzzy'
import { selectGroup, selectTab } from '../../common/layout'
import { COMMANDS, newAgentTab, newNamedTab, newTabWithProfile, run } from '../commands'
import { typeWhenReady } from '../agents'
import { shellQuote } from '../../common/commander'
import type { SshHost } from '../../common/ssh'
import { keysOf } from '../keyboard'
import { openProject, recentProjects } from '../projects'
import { api, commit, shortPath, ui, ws } from '../store'
import { tabTitle } from '../titles'

interface Item {
  id: string
  title: string
  section: string
  keys: string
  swatch?: string
  action: () => void
}

const hosts = ref<SshHost[]>([])
const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const projectsOnly = computed(() => ui.palette === 'projects')

/** The projects, most recent first; an open one says so. */
function projectItems(prefix: string): Item[] {
  const open = new Set(ws.value!.groups.map((g) => g.project))
  return recentProjects().map((p) => ({
    id: `project:${p.id}`,
    title: prefix + p.name,
    section: open.has(p.id) ? `открыт · ${shortPath(p.root)}` : shortPath(p.root),
    keys: '',
    swatch: p.color,
    action: () => openProject(p.id),
  }))
}

const items = computed<Item[]>(() => {
  const w = ws.value!
  const out: Item[] = []
  if (projectsOnly.value) {
    out.push(...projectItems(''))
    const save = COMMANDS.get('project.save')!
    out.push({ id: save.id, title: save.title, section: 'Проекты', keys: keysOf(save.id), action: () => run(save.id) })
    return out
  }
  out.push(...projectItems('Проект: '))
  for (const c of COMMANDS.values()) {
    if ((typeof c.hidden === 'function' ? c.hidden() : c.hidden) || c.id === 'palette.open') continue
    out.push({ id: c.id, title: c.title, section: c.group, keys: keysOf(c.id), action: () => run(c.id) })
  }
  for (const h of hosts.value) {
    out.push({
      id: `ssh:${h.alias}`, title: `SSH: ${h.alias}`, section: h.user ? `${h.user}@${h.hostname ?? h.alias}` : (h.hostname ?? 'SSH'), keys: '',
      action: () => typeWhenReady(newNamedTab(h.alias), `ssh ${shellQuote(h.alias, ui.os === 'win32')}`),
    })
  }
  for (const agent of ui.settings?.config.agents.commands ?? []) {
    out.push({ id: `agent:${agent}`, title: `Новый агент: ${agent}`, section: 'Агенты', keys: '', action: () => newAgentTab(agent) })
  }
  for (const name of Object.keys(ui.settings?.config.profiles ?? {})) {
    out.push({ id: `profile:${name}`, title: `Новая вкладка: ${name}`, section: 'Профили', keys: '', action: () => newTabWithProfile(name) })
  }
  for (const g of w.groups) {
    out.push({ id: `group:${g.id}`, title: `Группа: ${g.name}`, section: 'Перейти', keys: '', swatch: g.color, action: () => commit(selectGroup(ws.value!, g.id)) })
    for (const t of g.tabs) out.push({ id: `tab:${t.id}`, title: `${g.name} · ${tabTitle(t)}`, section: 'Перейти', keys: '', swatch: t.color ?? g.color, action: () => commit(selectTab(ws.value!, t.id)) })
  }
  return out
})

const shown = computed(() => {
  const q = query.value.trim()
  if (!q) return items.value.map((item) => ({ item, positions: [] as number[] }))
  return items.value
    .map((item) => ({ item, m: fuzzy(q, item.title) ?? fuzzy(q, item.id) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m!.score - a.m!.score)
    .map((x) => ({ item: x.item, positions: fuzzy(q, x.item.title)?.positions ?? [] }))
})

watch(query, () => (index.value = 0))
watch(index, () => void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })))

onMounted(() => {
  input.value?.focus()
  void api.remote.hosts().then((list) => (hosts.value = list))
})

function close(): void {
  ui.palette = false
}

function choose(i: number): void {
  const x = shown.value[i]
  if (!x) return
  close()
  x.item.action()
}

function key(e: KeyboardEvent): void {
  const n = shown.value.length
  if (e.key === 'ArrowDown') index.value = n ? (index.value + 1) % n : 0
  else if (e.key === 'ArrowUp') index.value = n ? (index.value - 1 + n) % n : 0
  else if (e.key === 'Enter') choose(index.value)
  else if (e.key === 'Escape') close()
  else return
  e.preventDefault()
}

/** The title cut into runs, the matched letters marked. */
function parts(title: string, positions: number[]): { text: string; hit: boolean }[] {
  const set = new Set(positions)
  const out: { text: string; hit: boolean }[] = []
  for (let i = 0; i < title.length; i++) {
    const hit = set.has(i)
    const last = out.at(-1)
    if (last && last.hit === hit) last.text += title[i]
    else out.push({ text: title[i]!, hit })
  }
  return out
}
</script>

<template>
  <div class="overlay" @pointerdown.self="close">
    <div class="palette" role="dialog" :aria-label="projectsOnly ? 'Проекты' : 'Палитра команд'">
      <div class="palette-input">
        <Search :size="16" aria-hidden="true" />
        <input
          ref="input"
          v-model="query"
          :aria-label="projectsOnly ? 'Проект' : 'Команда, группа или вкладка'"
          :placeholder="projectsOnly ? 'Проект — можно в любой раскладке' : 'Команда, группа или вкладка — можно в любой раскладке'"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          @keydown="key"
        />
      </div>
      <div id="palette-list" ref="list" class="palette-list" role="listbox">
        <div
          v-for="(x, i) in shown"
          :key="x.item.id"
          class="palette-item"
          role="option"
          :aria-selected="i === index"
          @pointermove="index = i"
          @click="choose(i)"
        >
          <span v-if="x.item.swatch" class="swatch" :style="{ background: x.item.swatch }" aria-hidden="true"></span>
          <span class="palette-title">
            <span v-for="(p, k) in parts(x.item.title, x.positions)" :key="k" :class="{ hit: p.hit }">{{ p.text }}</span>
          </span>
          <span class="palette-section">{{ x.item.section }}</span>
          <kbd v-if="x.item.keys">{{ x.item.keys }}</kbd>
        </div>
        <div v-if="shown.length === 0" class="palette-empty">Ничего не найдено</div>
      </div>
    </div>
  </div>
</template>
