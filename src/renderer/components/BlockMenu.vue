<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, say, ui } from '../store'
import * as terminals from '../terminals'

/** A command's block: its command and its output copied (as text or as Markdown), the command run again. */
const b = ui.block!
const menu = ref<HTMLElement | null>(null)
const place = computed(() => ({ left: `${Math.min(b.x, window.innerWidth - 240)}px`, top: `${Math.min(b.y, window.innerHeight - 200)}px` }))
onMounted(() => menu.value?.querySelector<HTMLElement>('button')?.focus())

function close(): void {
  ui.block = null
  terminals.get(b.paneId)?.view.focus()
}

function copy(text: string, what: string): void {
  api.copy(text)
  say(`${what} скопирован`)
  close()
}

/** Again, typed and run — only when the shell waits at its prompt. */
function again(): void {
  if (ui.busy[b.paneId]) return say('Команда ещё идёт — повторить можно, когда оболочка на промпте')
  const e = terminals.get(b.paneId)
  if (!e || !b.command) return
  terminals.typing(e)
  api.write(b.paneId, b.command + '\r')
  close()
}

const markdown = () => '```console\n$ ' + b.command + (b.output ? '\n' + b.output : '') + '\n```'
</script>

<template>
  <div class="overlay clear" @pointerdown.self="close" @contextmenu.prevent.self="close">
    <div ref="menu" class="block-menu" role="menu" :aria-label="`Команда ${b.command}`" :style="place" @keydown.esc.prevent="close">
      <div class="block-menu-title mono" :title="b.command">{{ b.command || 'команда' }}<span v-if="b.exitCode !== undefined" :class="b.exitCode === 0 ? 'ok' : 'fail'"> · {{ b.exitCode }}</span></div>
      <button type="button" role="menuitem" :disabled="!b.command" @click="copy(b.command, 'Текст команды')">Копировать команду</button>
      <button type="button" role="menuitem" :disabled="!b.output" @click="copy(b.output, 'Вывод')">Копировать вывод</button>
      <button type="button" role="menuitem" @click="copy(markdown(), 'Блок')">Копировать как Markdown</button>
      <button type="button" role="menuitem" :disabled="!b.command" @click="again">Повторить команду</button>
    </div>
  </div>
</template>
