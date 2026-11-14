<script setup lang="ts">
import { Check, LoaderCircle, X } from '@dskripchenko/ui/icons'
import type { AgentStatus } from '../../common/agents'

defineProps<{ status: AgentStatus | null; size?: number }>()

const LABEL: Record<AgentStatus, string> = { waiting: 'агент ждёт ввода', running: 'агент работает', done: 'агент закончил', failed: 'агент завершился с ошибкой', idle: '' }
</script>

<template>
  <span v-if="status === 'waiting'" class="agent-mark waiting" role="img" :aria-label="LABEL.waiting" :title="LABEL.waiting"></span>
  <LoaderCircle v-else-if="status === 'running'" class="agent-mark running" :size="size ?? 13" role="img" :aria-label="LABEL.running" />
  <Check v-else-if="status === 'done'" class="agent-mark done" :size="size ?? 13" :stroke-width="3" role="img" :aria-label="LABEL.done" />
  <X v-else-if="status === 'failed'" class="agent-mark failed" :size="size ?? 13" :stroke-width="3" role="img" :aria-label="LABEL.failed" />
</template>
