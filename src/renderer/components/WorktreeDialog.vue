<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { activeGroup, activeTab, addGroup } from '../../common/layout'
import { typeWhenReady } from '../agents'
import { api, baseName, commit, newId, say, ui, ws } from '../store'

const d = ui.worktree!
const branch = ref('')
const agent = ref('')
const error = ref('')
const busy = ref(false)
const agents = ui.settings?.config.agents.commands ?? []
const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())

/** The worktree made beside the repository, opened in a group of its own; the agent started there. */
async function save(): Promise<void> {
  const name = branch.value.trim()
  if (!name || busy.value) return
  busy.value = true
  const r = await api.addWorktree(d.cwd, name)
  busy.value = false
  if ('error' in r) {
    error.value = r.error
    return
  }
  ui.worktree = null
  const next = addGroup(ws.value!, newId, { name: name || baseName(r.path), cwd: r.path })
  commit(next)
  if (agent.value) typeWhenReady(activeTab(activeGroup(next)).focus, agent.value)
  say(`Worktree: ${r.path}`)
}

function cancel(): void {
  ui.worktree = null
}
</script>

<template>
  <div class="overlay" @pointerdown.self="cancel">
    <form class="dialog" role="dialog" aria-label="Новый worktree" @submit.prevent="save" @keydown.esc.prevent="cancel">
      <h2>Новый worktree</h2>
      <label for="branch-field">Ветка</label>
      <input id="branch-field" ref="input" v-model="branch" placeholder="Новая или существующая ветка" autocomplete="off" spellcheck="false" />
      <span class="dialog-hint">Папка рядом с репозиторием: {{ baseName(d.root) }}-ветка; откроется в новой группе.</span>
      <label for="agent-field">Агент в ней</label>
      <select id="agent-field" v-model="agent">
        <option value="">Без агента</option>
        <option v-for="a in agents" :key="a" :value="a">{{ a }}</option>
      </select>
      <span v-if="error" class="dialog-error" role="alert">{{ error }}</span>
      <div class="dialog-actions">
        <button type="button" class="button" @click="cancel">Отмена</button>
        <button type="submit" class="button primary" :disabled="busy || !branch.trim()">Создать</button>
      </div>
    </form>
  </div>
</template>
