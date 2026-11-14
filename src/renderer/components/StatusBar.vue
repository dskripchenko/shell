<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, TriangleAlert } from '@dskripchenko/ui/icons'
import { activeGroup, activeTab } from '../../common/layout'
import { keyErrors } from '../keyboard'
import { api, shortPath, ui, ws } from '../store'
import * as terminals from '../terminals'

const group = computed(() => activeGroup(ws.value!))
const paneId = computed(() => activeTab(group.value).focus)
const cwd = computed(() => {
  const c = terminals.paneCwd(paneId.value)
  return c ? shortPath(c) : ''
})
const size = computed(() => {
  // Read when the workspace changes; the terminal's size itself is not reactive.
  void ws.value
  const t = terminals.get(paneId.value)?.term
  return t ? `${t.cols}×${t.rows}` : ''
})
const update = computed(() => {
  const u = ui.update
  if (!u || !u.available) return null
  const s = u.state
  if (s.status === 'ready') return { text: `Обновление ${s.version} готово — перезапустить`, action: true }
  if (s.status === 'downloading') return { text: `Загрузка ${s.version}${s.total && s.received ? ` · ${Math.round((s.received / s.total) * 100)}%` : ''}`, action: false }
  return null
})
const problems = computed(() => [...(ui.settings?.errors ?? []), ...(ui.settings?.themeErrors ?? []), ...keyErrors])
</script>

<template>
  <footer class="statusbar">
    <span class="status-group"><span class="swatch" :style="{ background: group.color }" aria-hidden="true"></span>{{ group.name }}</span>
    <span v-if="cwd" class="mono" :title="cwd">{{ cwd }}</span>
    <span v-if="ui.branch" class="status-branch"><GitBranch :size="12" aria-hidden="true" />{{ ui.branch }}</span>
    <span v-if="ui.chain" class="status-chain" aria-live="polite">{{ ui.chain }} …</span>
    <span class="status-fill"></span>
    <button v-if="problems.length" type="button" class="status-problem" :title="problems.join('\n')" @click="api.openConfig()">
      <TriangleAlert :size="12" aria-hidden="true" />
      {{ problems.length === 1 ? problems[0] : `${problems.length} ошибки в настройках` }}
    </button>
    <button v-if="update?.action" type="button" class="status-update" @click="api.restartToUpdate()">{{ update.text }}</button>
    <span v-else-if="update">{{ update.text }}</span>
    <span v-if="size" class="mono">{{ size }}</span>
  </footer>
</template>
