<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X } from '@dskripchenko/ui/icons'
import { DEFAULTS } from '../../common/config'
import { api, say, ui } from '../store'

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
  say('config.toml открыт: профили, клавиши и команды агентов — там')
}
</script>

<template>
  <div class="overlay" @pointerdown.self="close">
    <section ref="panel" class="dialog settings" role="dialog" aria-label="Настройки" @keydown.esc.prevent="close">
      <header class="settings-head">
        <h2>Настройки</h2>
        <button type="button" class="icon-button" aria-label="Закрыть" title="Закрыть" @click="close"><X :size="14" aria-hidden="true" /></button>
      </header>
      <div class="settings-body">
        <fieldset>
          <legend>Шрифт</legend>
          <label for="s-family">Семейство</label>
          <input id="s-family" :value="config.font.family" spellcheck="false" @change="set('font', 'family', text($event))" />
          <div class="settings-row">
            <span>
              <label for="s-size">Размер</label>
              <input id="s-size" type="number" min="6" max="72" :value="config.font.size" @change="set('font', 'size', num($event))" />
            </span>
            <span>
              <label for="s-lh">Межстрочный</label>
              <input id="s-lh" type="number" min="0.8" max="3" step="0.05" :value="config.font.lineHeight" @change="set('font', 'line-height', num($event))" />
            </span>
          </div>
        </fieldset>
        <fieldset>
          <legend>Тема</legend>
          <label for="s-theme">Тема</label>
          <select id="s-theme" :value="config.theme.name" @change="set('theme', 'name', text($event))">
            <option v-for="t in themes" :key="t" :value="t">{{ t === 'system' ? 'Как в системе' : t }}</option>
          </select>
          <div v-if="config.theme.name === 'system'" class="settings-row">
            <span>
              <label for="s-light">Светлая</label>
              <select id="s-light" :value="config.theme.light" @change="set('theme', 'light', text($event))">
                <option v-for="t in themes.slice(1)" :key="t" :value="t">{{ t }}</option>
              </select>
            </span>
            <span>
              <label for="s-dark">Тёмная</label>
              <select id="s-dark" :value="config.theme.dark" @change="set('theme', 'dark', text($event))">
                <option v-for="t in themes.slice(1)" :key="t" :value="t">{{ t }}</option>
              </select>
            </span>
          </div>
          <label for="s-dim">Яркость неактивных панелей: {{ config.window.dimInactive }}</label>
          <input id="s-dim" type="range" min="0.5" max="1" step="0.05" :value="config.window.dimInactive" @change="set('window', 'dim-inactive', num($event))" />
        </fieldset>
        <fieldset>
          <legend>Вывод</legend>
          <label for="s-lines">Строк прокрутки</label>
          <input id="s-lines" type="number" min="0" max="1000000" step="1000" :value="config.scrollback.lines" @change="set('scrollback', 'lines', num($event))" />
          <label class="settings-check"><input type="checkbox" :checked="config.scrollback.restore" @change="set('scrollback', 'restore', checked($event))" /> Возвращать вывод вкладок после перезапуска</label>
        </fieldset>
        <fieldset>
          <legend>Выпадающее окно</legend>
          <label class="settings-check"><input type="checkbox" :checked="config.quake.enabled" @change="set('quake', 'enabled', checked($event))" /> По глобальному сочетанию</label>
          <div class="settings-row">
            <span>
              <label for="s-hotkey">Сочетание</label>
              <input id="s-hotkey" :value="config.quake.hotkey" spellcheck="false" @change="set('quake', 'hotkey', text($event))" />
            </span>
            <span>
              <label for="s-height">Доля высоты</label>
              <input id="s-height" type="number" min="0.15" max="1" step="0.05" :value="config.quake.height" @change="set('quake', 'height', num($event))" />
            </span>
          </div>
        </fieldset>
        <fieldset>
          <legend>Агенты и программы</legend>
          <label class="settings-check"><input type="checkbox" :checked="config.agents.notify" @change="set('agents', 'notify', checked($event))" /> Уведомлять, когда агент ждёт или закончил</label>
          <label class="settings-check"><input type="checkbox" :checked="config.folio.enabled" @change="set('folio', 'enabled', checked($event))" /> Связка с folio</label>
          <label class="settings-check"><input type="checkbox" :checked="config.updates.auto" @change="set('updates', 'auto', checked($event))" /> Проверять обновления раз в сутки</label>
          <label v-if="mac" class="settings-check"><input type="checkbox" :checked="config.security.secureKeyboard" @change="set('security', 'secure-keyboard', checked($event))" /> Защищённый ввод (Secure Keyboard Entry)</label>
        </fieldset>
        <p v-for="(e, id) in errors" :key="id" class="dialog-error" role="alert">{{ e }}</p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="button" @click="openFile">Открыть config.toml</button>
        <button type="button" class="button primary" @click="close">Готово</button>
      </div>
    </section>
  </div>
</template>
