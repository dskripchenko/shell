<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, X } from '@dskripchenko/ui/icons'
import { activeGroup, closeTab, moveTab, selectTab, type Tab } from '../../common/layout'
import { run } from '../commands'
import { keysOf } from '../keyboard'
import { commit, newId, ui, ws } from '../store'
import { tabTitle } from '../titles'

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

function drop(to: number): void {
  if (dragging.value) commit(moveTab(ws.value!, dragging.value, to))
  dragging.value = null
}
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="`Вкладки группы ${group.name}`">
    <div
      v-for="(tab, i) in group.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === group.activeTab }"
      role="tab"
      :aria-selected="tab.id === group.activeTab"
      tabindex="0"
      draggable="true"
      :title="`${tabTitle(tab)} — двойной щелчок: имя и цвет`"
      @click="select(tab)"
      @dblclick="rename(tab)"
      @keydown.enter="select(tab)"
      @auxclick.middle="close(tab)"
      @dragstart="dragging = tab.id"
      @dragover.prevent
      @drop="drop(i)"
    >
      <span class="swatch" :style="{ background: tab.color ?? 'var(--uid-text-tertiary)' }" aria-hidden="true"></span>
      <span class="tab-name">{{ tabTitle(tab) }}</span>
      <span v-if="tab.zoomed" class="tab-note" title="Панель развёрнута на всю вкладку">zoom</span>
      <button type="button" class="tab-close" :aria-label="`Закрыть вкладку ${tabTitle(tab)}`" @click.stop="close(tab)">
        <X :size="12" aria-hidden="true" />
      </button>
    </div>
    <button type="button" class="tab-add" :aria-label="`Новая вкладка ${keysOf('tab.new')}`" :title="`Новая вкладка ${keysOf('tab.new')}`" @click="run('tab.new')">
      <Plus :size="15" aria-hidden="true" />
    </button>
  </div>
</template>
