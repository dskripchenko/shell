<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, X } from '@dskripchenko/ui/icons'
import { focusedPane } from '../commands'
import { ui } from '../store'
import * as terminals from '../terminals'
import { m } from '../i18n'

const input = ref<HTMLInputElement | null>(null)
const find = ui.find!
const query = ref(find.query)
const count = ref(0)
const index = ref(0)
const paneId = focusedPane()

function view() {
  return terminals.get(paneId)?.view
}

function search(): void {
  const v = view()
  if (!v) return
  const q = query.value
  if (!q) {
    v.clearFind()
    count.value = 0
    return
  }
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  count.value = v.find(new RegExp(escaped, 'i'))
  index.value = count.value ? count.value - 1 : 0
  if (count.value) v.showMatch(index.value, true)
}

function step(by: number): void {
  if (!count.value) return
  index.value = (index.value + by + count.value) % count.value
  view()?.showMatch(index.value, true)
}

function close(): void {
  ui.find = null
}

watch(query, () => {
  if (ui.find) ui.find.query = query.value
  search()
})

onMounted(() => {
  input.value?.focus()
  input.value?.select()
  search()
})

onBeforeUnmount(() => view()?.clearFind())
</script>

<template>
  <div class="findbar" role="search">
    <input
      ref="input"
      v-model="query"
      :aria-label="m().find.label"
      :placeholder="m().find.label"
      @keydown.enter.prevent="step($event.shiftKey ? 1 : -1)"
      @keydown.esc.prevent="close"
    />
    <span class="find-count" aria-live="polite">{{ count ? m().find.of(index + 1, count) : query ? m().find.none : '' }}</span>
    <button type="button" class="icon-button" :aria-label="m().find.prev" @click="step(-1)"><ChevronUp :size="14" aria-hidden="true" /></button>
    <button type="button" class="icon-button" :aria-label="m().find.next" @click="step(1)"><ChevronDown :size="14" aria-hidden="true" /></button>
    <button type="button" class="icon-button" :aria-label="m().find.close" @click="close"><X :size="14" aria-hidden="true" /></button>
  </div>
</template>
