<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { COLORS, updateGroup, updateTab } from '../../common/layout'
import { commit, ui, ws } from '../store'

const d = ui.dialog!
const name = ref(d.name)
const color = ref<string | null>(d.color)
const profile = ref(d.profile ?? '')
const profiles = computed(() => Object.keys(ui.settings?.config.profiles ?? {}))
const input = ref<HTMLInputElement | null>(null)
const title = computed(() => (d.kind === 'tab' ? 'Вкладка' : d.isNew ? 'Новая группа' : 'Группа'))

onMounted(() => {
  input.value?.focus()
  input.value?.select()
})

function save(): void {
  const w = ws.value!
  if (d.kind === 'tab') commit(updateTab(w, d.id, { name: name.value, color: color.value }))
  else commit(updateGroup(w, d.id, { name: name.value.trim() || d.name, color: color.value ?? d.color ?? COLORS[0]!, profile: profile.value || null }))
  ui.dialog = null
}

function cancel(): void {
  ui.dialog = null
}
</script>

<template>
  <div class="overlay" @pointerdown.self="cancel">
    <form class="dialog" role="dialog" :aria-label="title" @submit.prevent="save" @keydown.esc.prevent="cancel">
      <h2>{{ title }}</h2>
      <label for="name-field">Имя</label>
      <input id="name-field" ref="input" v-model="name" :placeholder="d.kind === 'tab' ? 'Пусто — имя даёт программа или папка' : 'Имя группы'" />
      <fieldset>
        <legend>Цвет</legend>
        <div class="colors">
          <button
            v-if="d.kind === 'tab'"
            type="button"
            class="color none"
            :aria-pressed="color === null"
            aria-label="Без цвета"
            title="Без цвета"
            @click="color = null"
          ></button>
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            class="color"
            :style="{ background: c }"
            :aria-pressed="color === c"
            :aria-label="`Цвет ${c}`"
            @click="color = c"
          ></button>
        </div>
      </fieldset>
      <template v-if="d.kind === 'group'">
        <label for="profile-field">Профиль новых вкладок</label>
        <select id="profile-field" v-model="profile">
          <option value="">Оболочка по умолчанию</option>
          <option v-for="p in profiles" :key="p" :value="p">{{ p }}</option>
        </select>
        <span v-if="profiles.length === 0" class="dialog-hint">Профили задаются в config.toml, разделы [profiles.имя]</span>
      </template>
      <div class="dialog-actions">
        <button type="button" class="button" @click="cancel">Отмена</button>
        <button type="submit" class="button primary">Сохранить</button>
      </div>
    </form>
  </div>
</template>
