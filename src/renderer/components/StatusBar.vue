<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, TriangleAlert } from '@dskripchenko/ui/icons'
import { activeGroup, activeTab } from '../../common/layout'
import { keyErrors } from '../keyboard'
import { api, shortPath, ui, ws } from '../store'
import * as terminals from '../terminals'
import { m } from '../i18n'

const group = computed(() => activeGroup(ws.value!))
const paneId = computed(() => activeTab(group.value).focus)
const cwd = computed(() => {
  const c = terminals.paneCwd(paneId.value)
  return c ? shortPath(c) : ''
})
const size = computed(() => {
  // The view tells it as it is fit; before that, the terminal's own (not reactive: read when the workspace changes).
  void ws.value
  const told = ui.sizes[paneId.value]
  if (told) return told
  const t = terminals.get(paneId.value)?.term
  return t ? `${t.cols}×${t.rows}` : ''
})
const update = computed(() => {
  const u = ui.update
  if (!u || !u.available) return null
  const s = u.state
  if (s.status === 'ready') return { text: m().status.updateReady(s.version), action: true }
  if (s.status === 'downloading') return { text: `${m().status.downloading(s.version)}${s.total && s.received ? ` · ${Math.round((s.received / s.total) * 100)}%` : ''}`, action: false }
  return null
})
/** The agents that need the person, said in words: «claude ждёт ввода». */
const agentsNote = computed(() => {
  const words = m().agent.status
  const all = Object.values(ui.agents).filter((a) => a.status !== 'idle')
  const need = all.filter((a) => a.status === 'waiting' || a.status === 'failed')
  const show = (need.length ? need : all).slice(0, 2)
  return show.map((a) => `${a.name} ${words[a.status]}`).join(' · ') + (all.length > show.length ? ` · ${m().agent.more(all.length - show.length)}` : '')
})
const problems = computed(() => [...(ui.settings?.errors ?? []), ...(ui.settings?.themeErrors ?? []), ...keyErrors])
</script>

<template>
  <footer class="statusbar">
    <span class="status-group"><span class="swatch" :style="{ background: group.color }" aria-hidden="true"></span>{{ group.name }}</span>
    <span v-if="cwd" class="mono" :title="cwd">{{ cwd }}</span>
    <span v-if="ui.branch" class="status-branch"><GitBranch :size="12" aria-hidden="true" />{{ ui.branch }}</span>
    <span v-if="ui.chain" class="status-chain" aria-live="polite">{{ ui.chain }} …</span>
    <span v-if="agentsNote" class="status-agents" aria-live="polite">{{ agentsNote }}</span>
    <span v-if="ui.message" class="status-message" role="status">{{ ui.message }}</span>
    <button v-if="ui.broadcast" type="button" class="status-broadcast" :title="m().status.turnOff" @click="ui.broadcast = null">{{ m().status.broadcast(ui.broadcast) }}</button>
    <span class="status-fill"></span>
    <span v-if="ui.os === 'darwin' && ui.settings?.config.security.secureKeyboard" class="status-secure" :title="m().status.secureTip">{{ m().status.secure }}</span>
    <button v-if="problems.length" type="button" class="status-problem" :title="problems.join('\n')" @click="api.openConfig()">
      <TriangleAlert :size="12" aria-hidden="true" />
      {{ problems.length === 1 ? problems[0] : m().status.problems(problems.length) }}
    </button>
    <button v-if="update?.action" type="button" class="status-update" @click="api.restartToUpdate()">{{ update.text }}</button>
    <span v-else-if="update">{{ update.text }}</span>
    <span v-if="size" class="mono">{{ size }}</span>
  </footer>
</template>
