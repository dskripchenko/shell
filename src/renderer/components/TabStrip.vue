<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, X } from '@dskripchenko/ui/icons'
import { activeGroup, closeTab, moveTab, panes, selectTab, type Tab } from '../../common/layout'
import { run } from '../commands'
import { keysOf } from '../keyboard'
import { commit, newId, ui, ws } from '../store'
import { tabTitle } from '../titles'
import { tabStatus } from '../agentStatus'
import AgentMark from './AgentMark.vue'
import { reviewOf } from '../requests'
import type { GitStatus } from '../../common/git'
import { m } from '../i18n'

const group = computed(() => activeGroup(ws.value!))
const dragging = ref<string | null>(null)

function select(tab: Tab): void {
  commit(selectTab(ws.value!, tab.id))
}

function close(tab: Tab): void {
  commit(closeTab(ws.value!, tab.id, newId))
}

function rename(tab: Tab): void {
  ui.dialog = { kind: 'tab', id: tab.id, name: tab.name ?? '', color: tab.color ?? null }
}

function gitTitle(g: GitStatus): string {
  const t = m().tabs
  const parts = [t.branch(g.branch)]
  if (g.changed) parts.push(t.changed(g.changed))
  if (g.ahead) parts.push(t.ahead(g.ahead))
  if (g.behind) parts.push(t.behind(g.behind))
  return parts.join(', ')
}

function drop(to: number): void {
  if (dragging.value) commit(moveTab(ws.value!, dragging.value, to))
  dragging.value = null
}
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="m().tabs.ofGroup(group.name)">
    <div
      v-for="(tab, i) in group.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === group.activeTab }"
      role="tab"
      :aria-selected="tab.id === group.activeTab"
      tabindex="0"
      draggable="true"
      :title="m().tabs.tip(tabTitle(tab))"
      @click="select(tab)"
      @dblclick="rename(tab)"
      @keydown.enter="select(tab)"
      @auxclick.middle="close(tab)"
      @dragstart="dragging = tab.id; ui.draggingTab = tab.id"
      @dragend="ui.draggingTab = null"
      @dragover.prevent
      @drop="drop(i)"
    >
      <span class="swatch" :style="{ background: tab.color ?? 'var(--uid-text-tertiary)' }" aria-hidden="true"></span>
      <span class="tab-name">{{ tabTitle(tab) }}</span>
      <span v-if="ui.git[tab.id]" class="tab-git mono" :title="gitTitle(ui.git[tab.id]!)">{{ ui.git[tab.id]!.branch }}<span v-if="ui.git[tab.id]!.changed" class="tab-git-changed">●</span></span>
      <AgentMark :status="tabStatus(tab)" />
      <span v-if="panes(tab.root).some((p) => ui.marked[p.id])" class="tab-marked" role="img" :aria-label="m().tabs.triggered" :title="m().tabs.triggered"></span>
      <span v-if="reviewOf(panes(tab.root).map((p) => p.id))" class="tab-review" :title="`folio: ${reviewOf(panes(tab.root).map((p) => p.id))}`">{{ m().tabs.review }}</span>
      <span v-if="tab.zoomed" class="tab-note" :title="m().tabs.zoomed">zoom</span>
      <button type="button" class="tab-close" :aria-label="m().tabs.close(tabTitle(tab))" @click.stop="close(tab)">
        <X :size="12" aria-hidden="true" />
      </button>
    </div>
    <button type="button" class="tab-add" :aria-label="m().tabs.newTab(keysOf('tab.new'))" :title="m().tabs.newTab(keysOf('tab.new'))" @click="run('tab.new')">
      <Plus :size="15" aria-hidden="true" />
    </button>
  </div>
</template>
