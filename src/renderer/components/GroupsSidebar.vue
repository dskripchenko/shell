<script setup lang="ts">
import { computed } from 'vue'
import { PanelLeftClose, PanelLeftOpen, Plus } from '@dskripchenko/ui/icons'
import { selectGroup, type Group } from '../../common/layout'
import { run } from '../commands'
import { keysOf } from '../keyboard'
import { commit, ui, ws } from '../store'
import { initials } from '../titles'

const collapsed = computed(() => ws.value!.sidebarCollapsed)
const groups = computed(() => ws.value!.groups)

function select(g: Group): void {
  commit(selectGroup(ws.value!, g.id))
}

function rename(g: Group): void {
  ui.dialog = { kind: 'group', id: g.id, name: g.name, color: g.color }
}

function keys(i: number): string {
  return i < 9 ? keysOf(`group.select.${i + 1}`) : ''
}
</script>

<template>
  <nav v-if="!collapsed" class="sidebar" aria-label="Группы">
    <div class="sidebar-head">
      <span class="sidebar-title">Группы</span>
      <button type="button" class="icon-button" :aria-label="`Свернуть панель ${keysOf('sidebar.toggle')}`" :title="`Свернуть панель ${keysOf('sidebar.toggle')}`" @click="run('sidebar.toggle')">
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
      :title="`${g.name} — двойной щелчок: имя и цвет`"
      @click="select(g)"
      @dblclick="rename(g)"
    >
      <span class="swatch" :style="{ background: g.color }" aria-hidden="true"></span>
      <span class="group-name">{{ g.name }}</span>
      <span class="group-count">{{ g.tabs.length }}</span>
      <kbd>{{ keys(i) }}</kbd>
    </button>
    <div class="sidebar-fill"></div>
    <button type="button" class="sidebar-add" @click="run('group.new')">
      <Plus :size="14" aria-hidden="true" />
      <span>Новая группа</span>
      <kbd>{{ keysOf('group.new') }}</kbd>
    </button>
  </nav>
  <nav v-else class="rail" aria-label="Группы">
    <button type="button" class="icon-button rail-button" :aria-label="`Развернуть панель ${keysOf('sidebar.toggle')}`" :title="`Развернуть панель ${keysOf('sidebar.toggle')}`" @click="run('sidebar.toggle')">
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
    >
      {{ initials(g.name) }}
    </button>
    <div class="sidebar-fill"></div>
    <button type="button" class="icon-button rail-button" :aria-label="`Новая группа ${keysOf('group.new')}`" :title="`Новая группа ${keysOf('group.new')}`" @click="run('group.new')">
      <Plus :size="15" aria-hidden="true" />
    </button>
  </nav>
</template>
