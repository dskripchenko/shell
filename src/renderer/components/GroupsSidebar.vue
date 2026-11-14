<script setup lang="ts">
import { computed } from 'vue'
import { PanelLeftClose, PanelLeftOpen, Plus } from '@dskripchenko/ui/icons'
import { moveTabToGroup, selectGroup, type Group } from '../../common/layout'
import { run } from '../commands'
import { keysOf } from '../keyboard'
import { commit, newId, ui, ws } from '../store'
import { initials } from '../titles'
import { groupStatus } from '../agentStatus'
import AgentMark from './AgentMark.vue'
import { m } from '../i18n'

const collapsed = computed(() => ws.value!.sidebarCollapsed)
const groups = computed(() => ws.value!.groups)

function select(g: Group): void {
  commit(selectGroup(ws.value!, g.id))
}

function rename(g: Group): void {
  ui.dialog = { kind: 'group', id: g.id, name: g.name, color: g.color, profile: g.profile ?? '' }
}

/** A tab dragged from the strip and dropped on a group goes to that group. */
function drop(g: Group): void {
  const tab = ui.draggingTab
  ui.draggingTab = null
  if (tab) commit(moveTabToGroup(ws.value!, tab, g.id, newId))
}

function keys(i: number): string {
  return i < 9 ? keysOf(`group.select.${i + 1}`) : ''
}
</script>

<template>
  <nav v-if="!collapsed" class="sidebar" :aria-label="m().groupsBar.title">
    <div class="sidebar-head">
      <span class="sidebar-title">{{ m().groupsBar.title }}</span>
      <button type="button" class="icon-button" :aria-label="m().groupsBar.fold(keysOf('sidebar.toggle'))" :title="m().groupsBar.fold(keysOf('sidebar.toggle'))" @click="run('sidebar.toggle')">
        <PanelLeftClose :size="16" aria-hidden="true" />
      </button>
    </div>
    <button
      v-for="(g, i) in groups"
      :key="g.id"
      type="button"
      class="group-row"
      :class="{ active: g.id === ws!.activeGroup }"
      :aria-current="g.id === ws!.activeGroup ? 'true' : undefined"
      :title="m().groupsBar.groupTip(g.name)"
      @click="select(g)"
      @dblclick="rename(g)"
      @dragover.prevent
      @drop="drop(g)"
    >
      <span class="swatch" :style="{ background: g.color }" aria-hidden="true"></span>
      <span class="group-name">{{ g.name }}</span>
      <AgentMark :status="groupStatus(g)" />
      <span class="group-count">{{ g.tabs.length }}</span>
      <kbd>{{ keys(i) }}</kbd>
    </button>
    <div class="sidebar-fill"></div>
    <button type="button" class="sidebar-add" @click="run('group.new')">
      <Plus :size="14" aria-hidden="true" />
      <span>{{ m().groupsBar.newGroup }}</span>
      <kbd>{{ keysOf('group.new') }}</kbd>
    </button>
  </nav>
  <nav v-else class="rail" :aria-label="m().groupsBar.title">
    <button type="button" class="icon-button rail-button" :aria-label="m().groupsBar.unfold(keysOf('sidebar.toggle'))" :title="m().groupsBar.unfold(keysOf('sidebar.toggle'))" @click="run('sidebar.toggle')">
      <PanelLeftOpen :size="16" aria-hidden="true" />
    </button>
    <span class="rail-sep" aria-hidden="true"></span>
    <button
      v-for="(g, i) in groups"
      :key="g.id"
      type="button"
      class="rail-tile"
      :class="{ active: g.id === ws!.activeGroup }"
      :style="{ color: g.color }"
      :aria-label="`${g.name} ${keys(i)}`"
      :title="`${g.name} ${keys(i)}`"
      @click="select(g)"
      @dblclick="rename(g)"
      @dragover.prevent
      @drop="drop(g)"
    >
      {{ initials(g.name) }}
      <span v-if="groupStatus(g)" class="rail-mark"><AgentMark :status="groupStatus(g)" :size="10" /></span>
    </button>
    <div class="sidebar-fill"></div>
    <button type="button" class="icon-button rail-button" :aria-label="m().groupsBar.newGroupKeys(keysOf('group.new'))" :title="m().groupsBar.newGroupKeys(keysOf('group.new'))" @click="run('group.new')">
      <Plus :size="15" aria-hidden="true" />
    </button>
  </nav>
</template>
