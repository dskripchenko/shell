<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { focusPane, updateActiveTab, type Tab } from '../../common/layout'
import { commit, ui, ws } from '../store'
import * as terminals from '../terminals'

const props = defineProps<{ paneId: string; tab: Tab }>()
const slot = ref<HTMLElement | null>(null)
const focused = computed(() => props.tab.focus === props.paneId)
const multiple = computed(() => props.tab.root.kind === 'split' && !props.tab.zoomed)
const exitCode = computed(() => ui.exited[props.paneId])

function focusView(): void {
  if (!ui.palette && !ui.dialog && !ui.find && !ui.worktree && !ui.settingsOpen && !ui.block) terminals.get(props.paneId)?.view.focus()
}

onMounted(() => {
  const entry = terminals.ensure(props.paneId)
  if (!entry || !slot.value) return
  slot.value.append(entry.host)
  entry.view.fit()
  if (focused.value) void nextTick(focusView)
})

onBeforeUnmount(() => {
  const entry = terminals.get(props.paneId)
  // Taken out of the page, not ended: the shell runs on while its tab is hidden.
  if (entry && entry.host.parentElement === slot.value) entry.host.remove()
})

watch(focused, (now) => {
  if (now) void nextTick(focusView)
})
watch(
  () => [ui.palette, ui.dialog, ui.find, ui.worktree, ui.settingsOpen] as const,
  ([palette, dialog, find]) => {
    if (!palette && !dialog && !find && focused.value) void nextTick(focusView)
  },
)

function claimFocus(): void {
  if (!focused.value) commit(updateActiveTab(ws.value!, (t) => focusPane(t, props.paneId)))
}
/** Broadcasting reaches this pane: what is typed in any of them comes here too. */
const broadcasting = computed(() => !!ui.broadcast && terminals.broadcastTargets().includes(props.paneId))
</script>

<template>
  <section
    class="pane"
    :class="{ focused, dimmed: multiple && !focused, broadcast: broadcasting }"
    :aria-label="focused ? 'Активная панель' : 'Панель'"
    @pointerdown.capture="claimFocus"
  >
    <div ref="slot" class="pane-slot"></div>
    <div v-if="exitCode !== undefined" class="pane-exited">
      {{ exitCode === -1 ? 'Оболочка не запустилась' : `Процесс завершён с кодом ${exitCode}` }} — Enter запустит снова
    </div>
  </section>
</template>
