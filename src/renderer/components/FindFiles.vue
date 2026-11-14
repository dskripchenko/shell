<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { Found } from '../../common/ipc'
import { api, shortPath } from '../store'

/** Find files under a folder (MC's Alt+F7): by a name mask and, if given, a text in them. */
const props = defineProps<{ root: string }>()
const emit = defineEmits<{ (e: 'go', path: string): void; (e: 'close'): void }>()

const mask = ref('*')
const text = ref('')
const results = ref<Found[] | null>(null)
const partial = ref(false)
const error = ref('')
const busy = ref(false)
const at = ref(0)
const maskInput = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

onMounted(() => {
  maskInput.value?.focus()
  maskInput.value?.select()
})

async function find(): Promise<void> {
  busy.value = true
  error.value = ''
  const r = await api.findFiles(props.root, mask.value, text.value)
  busy.value = false
  if ('error' in r) {
    error.value = r.error
    results.value = []
    return
  }
  results.value = r.items
  partial.value = r.partial
  at.value = 0
  void nextTick(() => list.value?.focus())
}

/** A result's path from the folder searched. */
const rel = (path: string) => path.slice(props.root.replace(/[\\/]$/, '').length + 1)

function key(e: KeyboardEvent): void {
  const n = results.value?.length ?? 0
  if (e.key === 'ArrowDown') at.value = Math.min(n - 1, at.value + 1)
  else if (e.key === 'ArrowUp') at.value = Math.max(0, at.value - 1)
  else if (e.key === 'Enter' && results.value?.[at.value]) emit('go', results.value[at.value]!.path)
  else if (e.key === 'Escape') emit('close')
  else return
  e.preventDefault()
  e.stopPropagation()
  void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}
</script>

<template>
  <div class="overlay commander-overlay" @pointerdown.self="emit('close')">
    <div class="palette find-files" role="dialog" aria-label="Поиск файлов" @keydown.esc.stop.prevent="emit('close')">
      <form class="find-form" @submit.prevent="find">
        <div class="find-where mono" :title="root">Где: {{ shortPath(root) }}</div>
        <label>Имя (маска) <input ref="maskInput" v-model="mask" class="mono" spellcheck="false" placeholder="*.ts;*.vue" /></label>
        <label>Текст внутри <input v-model="text" spellcheck="false" placeholder="необязательно" /></label>
        <button type="submit" class="button primary" :disabled="busy">{{ busy ? 'Ищу…' : 'Найти' }}</button>
      </form>
      <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
      <div v-if="results" ref="list" class="palette-list" role="listbox" tabindex="0" aria-label="Найденные файлы" @keydown="key">
        <div v-if="!results.length" class="palette-item">Ничего не найдено</div>
        <div v-for="(f, i) in results" :key="f.path" class="palette-item" role="option" :aria-selected="i === at" @pointermove="at = i" @click="emit('go', f.path)">
          <span class="palette-title mono">{{ rel(f.path) }}</span>
          <span v-if="f.line" class="palette-section">строка {{ f.line }}</span>
        </div>
      </div>
      <div v-if="results" class="find-foot">{{ results.length }}{{ partial ? '+ (поиск остановлен на пределе)' : '' }} · Enter — к файлу в панели</div>
    </div>
  </div>
</template>
