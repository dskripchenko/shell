<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ExternalLink, Pencil, X } from '@dskripchenko/ui/icons'
import type { ViewerDoc } from '../../common/ipc'
import { lineOfText, viewKind } from '../../common/viewer'
import { api, say, shortPath, toFolio, ui } from '../store'
import { currentTheme } from '../theme'
import { m } from '../i18n'

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
  frame.value.contentWindow.postMessage({ type: 'show', name: d.name, base: d.base, url: d.url, text: d.text, size: d.size, theme: t.kind, background: t.background, foreground: t.foreground, lang: ui.lang }, '*')
}

/**
 * The document edited where it was double-clicked: in folio at that line when
 * folio is there (shell's viewer only reads), else by the system's program.
 * A code file is one block: its line is the place clicked; elsewhere the
 * block's text is looked for in the source.
 */
function edit(text: string, index: number | null): void {
  const d = doc.value
  if (!d || d.text === null) return
  if (!ui.folio) {
    api.openPath(d.path)
    return
  }
  const kind = viewKind(d.name, d.text).kind
  const line = kind === 'code' && index !== null ? index + 1 : lineOfText(d.text, text)
  toFolio({ file: { path: d.path, ...(line ? { line } : {}) } })
}

/** PDFs and HTML pages in frames of their own; the rest in the viewer page. */
const asCode = ref(false)
const isHtml = computed(() => /\.html?$/i.test(doc.value?.name ?? ''))
const frameKind = computed(() => {
  const name = doc.value?.name ?? ''
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (isHtml.value && !asCode.value) return 'html'
  return 'viewer'
})
watch(() => ui.viewer?.path, () => (asCode.value = false))
watch(frameKind, (k) => k === 'viewer' && void nextTick(send))

/** Only the viewer page is listened to: a link it was asked to follow. */
function onMessage(e: MessageEvent): void {
  if (!frame.value || e.source !== frame.value.contentWindow || !e.data) return
  if (e.data.type === 'ready') {
    ready = true
    send()
    return
  }
  if (e.data.type === 'edit' && doc.value) return edit(typeof e.data.text === 'string' ? e.data.text : '', typeof e.data.index === 'number' ? e.data.index : null)
  if (e.data.type !== 'link' || typeof e.data.href !== 'string' || !doc.value) return
  const href: string = e.data.href
  if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) return api.openExternal(href)
  const d = doc.value
  // A file in the document's folder or below it: shown here, by its path from the document's own.
  if (!href.startsWith(d.base)) return say(m().say.linkAbove)
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
  <aside class="viewer" :aria-label="m().viewer.label" @keydown.esc="ui.viewer = null">
    <header class="changes-head">
      <span class="changes-title">{{ doc?.name ?? m().viewer.title }}</span>
      <span v-if="doc" class="changes-sub mono" :title="doc.path">{{ shortPath(doc.path.slice(0, doc.path.length - doc.name.length)) }}</span>
      <span class="changes-fill"></span>
      <button v-if="doc && ui.folio" type="button" class="icon-button" :aria-label="m().viewer.editFolio" :title="m().viewer.editFolioTip" @click="toFolio({ file: { path: doc.path, ...(ui.viewer?.line ? { line: ui.viewer.line } : {}) } })"><Pencil :size="14" aria-hidden="true" /></button>
      <button v-if="doc && isHtml" type="button" class="button small" :aria-pressed="asCode" @click="asCode = !asCode">{{ asCode ? m().viewer.asPage : m().viewer.asCode }}</button>
      <button v-if="doc" type="button" class="icon-button" :aria-label="m().viewer.openSystem" :title="m().viewer.openSystem" @click="api.openPath(doc.path)"><ExternalLink :size="14" aria-hidden="true" /></button>
      <button type="button" class="icon-button" :aria-label="m().viewer.close" :title="m().viewer.close" @click="ui.viewer = null"><X :size="14" aria-hidden="true" /></button>
    </header>
    <div v-if="error" class="changes-empty">{{ error }}</div>
    <!-- A PDF in Chromium's own viewer: a frame of its own, served as a PDF only. -->
    <iframe v-if="!error && doc && frameKind === 'pdf'" class="viewer-frame" :src="doc.url" :title="doc.name" data-kind="pdf"></iframe>
    <!-- An HTML page as a page: sandboxed (an opaque origin), its folder's files only, no network (the scheme's CSP). -->
    <iframe v-else-if="!error && doc && frameKind === 'html'" class="viewer-frame page" :src="doc.url" sandbox="allow-scripts" :title="doc.name" data-kind="html"></iframe>
    <!-- Sandboxed, on an origin of its own: the document cannot reach the window or its IPC. -->
    <iframe v-show="!error && frameKind === 'viewer'" ref="frame" class="viewer-frame" src="shell-doc://app/viewer.html" sandbox="allow-scripts" :title="m().viewer.label"></iframe>
  </aside>
</template>
