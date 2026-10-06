<script setup lang="ts">
import type { Server } from '~/composables/useServers'

const props = defineProps<{ server: Server }>()
const adopting = ref(false)
const colors = { running: 'success', starting: 'warning', stopping: 'warning', stopped: 'neutral', failing: 'error' } as const
const age = computed(() => {
  const s = props.server.ageSeconds
  return s >= 86400 ? `${Math.floor(s / 86400)}d` : s >= 3600 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 60)}m`
})
</script>

<template>
  <UCard data-testid="server-card">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">{{ server.name }}</h2>
      <div class="flex gap-1">
        <UBadge v-if="server.protected" data-testid="protected-badge" color="neutral" variant="subtle" icon="i-lucide-lock">protected</UBadge>
        <UBadge data-testid="state-badge" :color="colors[server.state]" variant="subtle">{{ server.state }}</UBadge>
      </div>
    </div>
    <dl class="mt-2 text-sm text-muted">
      <div>World: {{ server.worldName }}</div>
      <div>Mode: {{ server.gameMode }}</div>
      <div>Port: {{ server.port ?? 'n/a' }}</div>
      <div>Age: {{ age }}</div>
    </dl>
    <UButton v-if="!server.managed" data-testid="adopt" class="mt-2" size="sm" variant="outline" @click="adopting = true">Adopt</UButton>
    <Suspense v-if="adopting">
      <AdoptDialog :name="server.name" class="mt-2" @close="adopting = false" />
    </Suspense>
  </UCard>
</template>
