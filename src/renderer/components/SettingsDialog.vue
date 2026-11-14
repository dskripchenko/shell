<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X } from '@dskripchenko/ui/icons'
import { DEFAULTS } from '../../common/config'
import { api, say, ui } from '../store'
import { m } from '../i18n'
import { LANGS, messagesOf } from '../../common/i18n'

/**
 * The settings with fields: each change written into config.toml at once
 * (its comments and the person's own lines kept), applied as from any edit
 * of the file. What has no field here — profiles, keys, agents' commands —
 * is in the file itself.
 */
const config = computed(() => ui.settings?.config ?? DEFAULTS)
const themes = computed(() => ['system', ...(ui.settings?.themes.map((t) => t.name) ?? [])])
const errors = ref<Record<string, string>>({})
const panel = ref<HTMLElement | null>(null)
const mac = ui.os === 'darwin'

onMounted(() => panel.value?.querySelector<HTMLElement>('input, select')?.focus())

async function set(section: string, key: string, value: string | number | boolean): Promise<void> {
  const r = await api.setSetting(section, key, value)
  const id = `${section}.${key}`
  if ('error' in r) errors.value = { ...errors.value, [id]: r.error }
  else {
    const rest = { ...errors.value }
    delete rest[id]
    errors.value = rest
  }
}

const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const text = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked

function close(): void {
  ui.settingsOpen = false
}

function openFile(): void {
  api.openConfig()
  say(m().say.configOpened)
}
</script>

<template>
  <div class="overlay" @pointerdown.self="close">
    <section ref="panel" class="dialog settings" role="dialog" :aria-label="m().settings.title" @keydown.esc.prevent="close">
      <header class="settings-head">
        <h2>{{ m().settings.title }}</h2>
        <button type="button" class="icon-button" :aria-label="m().common.close" :title="m().common.close" @click="close"><X :size="14" aria-hidden="true" /></button>
      </header>
      <div class="settings-body">
        <fieldset>
          <legend>{{ m().settings.language }}</legend>
          <select id="s-lang" :aria-label="m().settings.language" :value="config.ui.language" @change="set('ui', 'language', text($event))">
            <option value="auto">{{ m().settings.languageAuto }}</option>
            <option v-for="l in LANGS" :key="l" :value="l">{{ messagesOf(l).langName }}</option>
          </select>
        </fieldset>
        <fieldset>
          <legend>{{ m().settings.font }}</legend>
          <label for="s-family">{{ m().settings.family }}</label>
          <input id="s-family" :value="config.font.family" spellcheck="false" @change="set('font', 'family', text($event))" />
          <div class="settings-row">
            <span>
              <label for="s-size">{{ m().settings.size }}</label>
              <input id="s-size" type="number" min="6" max="72" :value="config.font.size" @change="set('font', 'size', num($event))" />
            </span>
            <span>
              <label for="s-lh">{{ m().settings.lineHeight }}</label>
              <input id="s-lh" type="number" min="0.8" max="3" step="0.05" :value="config.font.lineHeight" @change="set('font', 'line-height', num($event))" />
            </span>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ m().settings.theme }}</legend>
          <label for="s-theme">{{ m().settings.theme }}</label>
          <select id="s-theme" :value="config.theme.name" @change="set('theme', 'name', text($event))">
            <option v-for="t in themes" :key="t" :value="t">{{ t === 'system' ? m().settings.system : t }}</option>
          </select>
          <div v-if="config.theme.name === 'system'" class="settings-row">
            <span>
              <label for="s-light">{{ m().settings.light }}</label>
              <select id="s-light" :value="config.theme.light" @change="set('theme', 'light', text($event))">
                <option v-for="t in themes.slice(1)" :key="t" :value="t">{{ t }}</option>
              </select>
            </span>
            <span>
              <label for="s-dark">{{ m().settings.dark }}</label>
              <select id="s-dark" :value="config.theme.dark" @change="set('theme', 'dark', text($event))">
                <option v-for="t in themes.slice(1)" :key="t" :value="t">{{ t }}</option>
              </select>
            </span>
          </div>
          <label for="s-dim">{{ m().settings.dim(config.window.dimInactive) }}</label>
          <input id="s-dim" type="range" min="0.5" max="1" step="0.05" :value="config.window.dimInactive" @change="set('window', 'dim-inactive', num($event))" />
        </fieldset>
        <fieldset>
          <legend>{{ m().settings.output }}</legend>
          <label for="s-lines">{{ m().settings.lines }}</label>
          <input id="s-lines" type="number" min="0" max="1000000" step="1000" :value="config.scrollback.lines" @change="set('scrollback', 'lines', num($event))" />
          <label class="settings-check"><input type="checkbox" :checked="config.scrollback.restore" @change="set('scrollback', 'restore', checked($event))" /> {{ m().settings.restore }}</label>
        </fieldset>
        <fieldset>
          <legend>{{ m().settings.quake }}</legend>
          <label class="settings-check"><input type="checkbox" :checked="config.quake.enabled" @change="set('quake', 'enabled', checked($event))" /> {{ m().settings.quakeOn }}</label>
          <div class="settings-row">
            <span>
              <label for="s-hotkey">{{ m().settings.hotkey }}</label>
              <input id="s-hotkey" :value="config.quake.hotkey" spellcheck="false" @change="set('quake', 'hotkey', text($event))" />
            </span>
            <span>
              <label for="s-height">{{ m().settings.height }}</label>
              <input id="s-height" type="number" min="0.15" max="1" step="0.05" :value="config.quake.height" @change="set('quake', 'height', num($event))" />
            </span>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ m().settings.agents }}</legend>
          <label class="settings-check"><input type="checkbox" :checked="config.agents.notify" @change="set('agents', 'notify', checked($event))" /> {{ m().settings.notify }}</label>
          <label class="settings-check"><input type="checkbox" :checked="config.folio.enabled" @change="set('folio', 'enabled', checked($event))" /> {{ m().settings.folio }}</label>
          <label class="settings-check"><input type="checkbox" :checked="config.updates.auto" @change="set('updates', 'auto', checked($event))" /> {{ m().settings.updates }}</label>
          <label v-if="mac" class="settings-check"><input type="checkbox" :checked="config.security.secureKeyboard" @change="set('security', 'secure-keyboard', checked($event))" /> {{ m().settings.secure }}</label>
        </fieldset>
        <p v-for="(e, id) in errors" :key="id" class="dialog-error" role="alert">{{ e }}</p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="button" @click="openFile">{{ m().settings.openFile }}</button>
        <button type="button" class="button primary" @click="close">{{ m().common.done }}</button>
      </div>
    </section>
  </div>
</template>
