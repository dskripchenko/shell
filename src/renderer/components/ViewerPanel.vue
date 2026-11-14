<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ExternalLink, X } from '@dskripchenko/ui/icons'
import type { ViewerDoc } from '../../common/ipc'
import { api, say, shortPath, ui } from '../store'
import { currentTheme } from '../theme'

const frame = ref<HTMLIFrameElement | null>(null)
const doc = ref<ViewerDoc | null>(null)
const error = ref('')
let ready = false

async function load(): Promise<void> {
  const v = ui.viewer
  if (!v) return
  const r = await api.viewerOpen(v.path, v.cwd)
  if ('error' in r) {
    error.value = `${v.path}: ${r.error}`
    doc.value = null
    return
  }
  error.value = ''
  doc.value = r
  send()
}

/** What the viewer page shows, sent when both it and the document are ready. */
function send(): void {
  const d = doc.value
  if (!ready || !d || !frame.value?.contentWindow) return
  const t = currentTheme()
  frame.value.contentWindow.postMessage({ type: 'show', name: d.name, base: d.base, url: d.url, text: d.text, size: d.size, theme: t.kind, background: t.background, foreground: t.foreground }, '*')
}

/** Only the viewer page is listened to: a link it was asked to follow. */
function onMessage(e: MessageEvent): void {
  if (!frame.value || e.source !== frame.value.contentWindow || !e.data) return
  if (e.data.type === 'ready') {
    ready = true
    send()
    return
  }
  if (e.data.type !== 'link' || typeof e.data.href !== 'string' || !doc.value) return
  const href: string = e.data.href
  if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) return api.openExternal(href)
  const d = doc.value
  // A file in the document's folder or below it: shown here, by its path from the document's own.
  if (!href.startsWith(d.base)) return say('Ссылка ведёт выше папки документа — откройте файл из панелей')
  const folder = d.path.slice(0, d.path.length - d.name.length)
  ui.viewer = { path: folder + decodeURIComponent(href.slice(d.base.length).split('#')[0]!) }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  void load()
})
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
watch(() => ui.viewer?.path, () => void load())
watch(() => [ui.systemDark, ui.settings], send)
</script>

<template>
  <aside class="viewer" aria-label="Просмотр файла" @keydown.esc="ui.viewer = null">
    <header class="changes-head">
      <span class="changes-title">{{ doc?.name ?? 'Просмотр' }}</span>
      <span v-if="doc" class="changes-sub mono" :title="doc.path">{{ shortPath(doc.path.slice(0, doc.path.length - doc.name.length)) }}</span>
      <span class="changes-fill"></span>
      <button v-if="doc" type="button" class="icon-button" aria-label="Открыть программой системы" title="Открыть программой системы" @click="api.openPath(doc.path)"><ExternalLink :size="14" aria-hidden="true" /></button>
      <button type="button" class="icon-button" aria-label="Закрыть просмотр" title="Закрыть просмотр" @click="ui.viewer = null"><X :size="14" aria-hidden="true" /></button>
    </header>
    <div v-if="error" class="changes-empty">{{ error }}</div>
    <!-- Sandboxed, on an origin of its own: the document cannot reach the window or its IPC. -->
    <iframe v-show="!error" ref="frame" class="viewer-frame" src="shell-doc://app/viewer.html" sandbox="allow-scripts" title="Просмотр файла"></iframe>
  </aside>
</template>
