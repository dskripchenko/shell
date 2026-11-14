<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatSize, formatTime, type PanelState } from '../../common/commander'
import { shortPath } from '../store'
import { parseArchive } from '../../common/archive'

const props = defineProps<{ panel: PanelState; active: boolean; label: string }>()
defineEmits<{ (e: 'pick', index: number): void; (e: 'open', index: number): void }>()

/** The rows: `..` first (except at the root), then the folder's entries. */
const rows = computed(() => props.panel.entries)
const list = ref<HTMLElement | null>(null)
watch(
  () => props.panel.cursor,
  () => void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })),
)
const markedSize = computed(() => props.panel.entries.filter((e) => props.panel.marked.includes(e.name)).reduce((a, e) => a + (e.kind === 'file' ? e.size : 0), 0))
const current = computed(() => rows.value[props.panel.cursor])
/** The folder as people read it: an archive's as `a.zip › src`. */
const where = computed(() => {
  const a = parseArchive(props.panel.dir)
  return a ? `${shortPath(a.file)} › ${a.inner || '/'}` : shortPath(props.panel.dir)
})
</script>

<template>
  <section class="fpanel" :class="{ active }" :aria-label="label">
    <header class="fpanel-head mono" :title="panel.dir">{{ where }}</header>
    <div class="fpanel-cols" aria-hidden="true"><span>Имя</span><span>Размер</span><span>Изменён</span></div>
    <div ref="list" class="fpanel-list mono" role="listbox" :aria-label="`Файлы: ${panel.dir}`" :aria-activedescendant="`${label}-${panel.cursor}`">
      <div v-if="panel.error" class="fpanel-error">{{ panel.error }}</div>
      <div
        v-for="(e, i) in rows"
        :id="`${label}-${i}`"
        :key="e.name"
        class="fpanel-row"
        role="option"
        :aria-selected="i === panel.cursor"
        :class="{ cursor: i === panel.cursor && active, cursorIdle: i === panel.cursor && !active, marked: panel.marked.includes(e.name), dir: e.kind === 'dir' || e.linkToDir || e.name === '..' }"
        @click="$emit('pick', i)"
        @dblclick="$emit('open', i)"
      >
        <span class="fpanel-name">{{ e.kind === 'dir' || e.linkToDir ? `${e.name}/` : e.name }}</span>
        <span class="fpanel-size">{{ e.name === '..' ? '' : e.kind === 'dir' || e.linkToDir ? 'папка' : formatSize(e.size) }}</span>
        <span class="fpanel-time">{{ e.name === '..' ? '' : formatTime(e.mtime) }}</span>
      </div>
    </div>
    <footer class="fpanel-foot">
      <span v-if="panel.marked.length" class="fpanel-marked">{{ panel.marked.length }} выбрано · {{ formatSize(markedSize) }}</span>
      <span v-else class="mono">{{ current && current.name !== '..' ? current.name : '' }}</span>
      <span class="fpanel-fill"></span>
      <span>{{ Math.max(0, rows.length - 1) }} объектов</span>
    </footer>
  </section>
</template>
