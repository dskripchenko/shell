<script setup lang="ts">
import { computed } from 'vue'
import { activeGroup, activeTab, findPane } from '../common/layout'
import { Settings2, Search } from '@dskripchenko/ui/icons'
import ChangesPanel from './components/ChangesPanel.vue'
import ViewerPanel from './components/ViewerPanel.vue'
import FileCommander from './components/FileCommander.vue'
import FindBar from './components/FindBar.vue'
import GroupsSidebar from './components/GroupsSidebar.vue'
import NameDialog from './components/NameDialog.vue'
import CommandPalette from './components/CommandPalette.vue'
import PaneTree from './components/PaneTree.vue'
import StatusBar from './components/StatusBar.vue'
import TabStrip from './components/TabStrip.vue'
import { run } from './commands'
import { keysOf } from './keyboard'
import { ui, ws } from './store'

const tab = computed(() => (ws.value ? activeTab(activeGroup(ws.value)) : null))
/** A zoomed pane is drawn alone, as if it were the tab's only one. */
const root = computed(() => {
  const t = tab.value
  if (!t) return null
  return t.zoomed ? (findPane(t.root, t.zoomed) ?? t.root) : t.root
})
const dim = computed(() => String(ui.settings?.config.window.dimInactive ?? 0.8))
</script>

<template>
  <div v-if="ws && tab && root" class="app" :class="{ quake: ui.quake, mac: ui.platform === 'mac' }" :style="{ '--dim': dim }">
    <header class="titlebar">
      <div v-if="ui.platform === 'mac' && !ui.quake" class="traffic" aria-hidden="true"></div>
      <TabStrip />
      <div class="titlebar-fill"></div>
      <div class="titlebar-actions">
        <button type="button" class="chip" :title="`Палитра команд ${keysOf('palette.open')}`" @click="run('palette.open')">
          <Search :size="13" aria-hidden="true" />
          <span>Команды</span>
          <kbd>{{ keysOf('palette.open') }}</kbd>
        </button>
        <button type="button" class="icon-button" :aria-label="`Настройки ${keysOf('config.open')}`" :title="`Настройки — config.toml ${keysOf('config.open')}`" @click="run('config.open')">
          <Settings2 :size="15" aria-hidden="true" />
        </button>
      </div>
      <div v-if="ui.platform !== 'mac' && !ui.quake" class="window-controls" aria-hidden="true"></div>
    </header>
    <div class="body">
      <GroupsSidebar v-if="!ui.quake" />
      <main class="panes">
        <PaneTree :key="tab.id" :node="root" :tab="tab" :path="[]" />
        <FindBar v-if="ui.find" />
        <FileCommander v-if="ui.commander && !ui.quake" />
      </main>
      <ViewerPanel v-if="ui.viewer && !ui.quake" />
      <ChangesPanel v-else-if="ui.changesOpen && !ui.quake" />
    </div>
    <StatusBar />
    <CommandPalette v-if="ui.palette" />
    <NameDialog v-if="ui.dialog" />
  </div>
</template>
