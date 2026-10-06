<script setup lang="ts">
const props = defineProps<{ name: string }>()
const command = ref('')
const output = ref<string[]>([])
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  if (/[\r\n]/.test(command.value) || !command.value.trim()) {
    error.value = 'Enter a single line command'
    return
  }
  busy.value = true
  try {
    const res = await $fetch<{ command: string, lines: string[] }>(`/api/servers/${props.name}/command`, { method: 'POST', body: { command: command.value } })
    output.value = [...output.value, `> ${res.command}`, ...res.lines]
    command.value = ''
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'command failed'
  }
  busy.value = false
}
</script>

<template>
  <div>
    <p class="mb-2 text-sm text-muted">
      Commands like allowlist and op are runtime-only when ALLOW_LIST_USERS or OPS are set and are lost on restart; use Settings for durable changes.
    </p>
    <pre data-testid="console-output" class="mb-2 max-h-72 overflow-auto rounded bg-elevated p-2 text-xs">{{ output.join('\n') }}</pre>
    <form class="flex gap-2" @submit.prevent="submit">
      <UInput v-model="command" class="flex-1" placeholder="say hello" />
      <UButton type="submit" :loading="busy">Send</UButton>
    </form>
    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" :title="error" />
  </div>
</template>
