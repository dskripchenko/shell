<script setup lang="ts">
import { ref } from 'vue'
import { resizeSplit, updateActiveTab, updateSplit, type PaneNode, type Tab } from '../../common/layout'
import { commit, ws } from '../store'
import TerminalPane from './TerminalPane.vue'

const props = defineProps<{ node: PaneNode; tab: Tab; path: number[] }>()
const box = ref<HTMLElement | null>(null)

/** A border dragged: the two panes beside it share their room anew. */
function drag(index: number, start: PointerEvent): void {
  const node = props.node
  if (node.kind !== 'split' || !box.value) return
  const el = start.currentTarget as HTMLElement
  el.setPointerCapture(start.pointerId)
  const rect = box.value.getBoundingClientRect()
  const total = node.dir === 'row' ? rect.width : rect.height
  const origin = node.dir === 'row' ? start.clientX : start.clientY
  const sizes = node.sizes
  const move = (e: PointerEvent) => {
    const delta = ((node.dir === 'row' ? e.clientX : e.clientY) - origin) / total
    const next = resizeSplit(sizes, index, delta)
    commit(updateActiveTab(ws.value!, (t) => ({ ...t, root: updateSplit(t.root, props.path, (s) => ({ ...s, sizes: next })) })))
  }
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}
</script>

<template>
  <TerminalPane v-if="node.kind === 'pane'" :pane-id="node.id" :tab="tab" />
  <div v-else ref="box" class="split" :class="node.dir">
    <template v-for="(child, i) in node.children" :key="child.kind === 'pane' ? child.id : `s${i}`">
      <div class="split-cell" :style="{ flex: `${node.sizes[i]} 1 0` }">
        <PaneTree :node="child" :tab="tab" :path="[...path, i]" />
      </div>
      <div
        v-if="i < node.children.length - 1"
        class="divider"
        role="separator"
        :aria-orientation="node.dir === 'row' ? 'vertical' : 'horizontal'"
        @pointerdown.prevent="drag(i, $event)"
      ></div>
    </template>
  </div>
</template>
