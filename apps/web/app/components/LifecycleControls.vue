<script setup lang="ts">
const props = defineProps<{ name: string, state: string }>()
const pending = ref<'stop' | 'restart' | null>(null)
const warnings = ref<string[]>([])
const error = ref('')
const busy = ref(false)
const idle = computed(() => !busy.value && props.state !== 'starting' && props.state !== 'stopping')

async function run(action: 'start' | 'stop' | 'restart') {
  pending.value = null
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ warnings: string[] }>(`/api/servers/${props.name}/${action}`, {
      method: 'POST',
      body: action === 'start' ? undefined : { confirm: true },
    })
    warnings.value = res.warnings
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? `${action} failed`
  }
  busy.value = false
}
</script>

<template>
  <div>
    <div class="flex gap-2">
      <UButton data-testid="start" :disabled="!idle || state !== 'stopped'" @click="run('start')">Start</UButton>
      <UButton data-testid="stop" color="neutral" variant="outline" :disabled="!idle || state === 'stopped'" @click="pending = 'stop'">Stop</UButton>
      <UButton data-testid="restart" color="neutral" variant="outline" :disabled="!idle || state === 'stopped'" @click="pending = 'restart'">Restart</UButton>
    </div>
    <UAlert v-for="w in warnings" :key="w" class="mt-2" color="warning" variant="subtle" :title="w" />
    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" :title="error" />
    <ConfirmDialog
      v-if="pending"
      class="mt-2"
      :title="`${pending === 'stop' ? 'Stop' : 'Restart'} ${name}`"
      :body="pending === 'stop' ? 'Players are disconnected after a graceful shutdown that saves the world.' : 'The server restarts and players are disconnected for a short while.'"
      @confirm="run(pending!)"
      @cancel="pending = null"
    />
  </div>
</template>
