<script setup lang="ts">
import { computed } from 'vue'
import { Check, LoaderCircle, X } from '@dskripchenko/ui/icons'
import type { AgentStatus } from '../../common/agents'
import { m } from '../i18n'

defineProps<{ status: AgentStatus | null; size?: number }>()

const LABEL = computed<Record<AgentStatus, string>>(() => {
  const a = m().agent
  return { waiting: a.waiting, running: a.running, done: a.done, failed: a.failed, idle: '' }
})
</script>

<template>
  <span v-if="status === 'waiting'" class="agent-mark waiting" role="img" :aria-label="LABEL.waiting" :title="LABEL.waiting"></span>
  <LoaderCircle v-else-if="status === 'running'" class="agent-mark running" :size="size ?? 13" role="img" :aria-label="LABEL.running" />
  <Check v-else-if="status === 'done'" class="agent-mark done" :size="size ?? 13" :stroke-width="3" role="img" :aria-label="LABEL.done" />
  <X v-else-if="status === 'failed'" class="agent-mark failed" :size="size ?? 13" :stroke-width="3" role="img" :aria-label="LABEL.failed" />
</template>
