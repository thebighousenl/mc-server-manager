<script setup lang="ts">
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ close: [] }>()
const url = `/api/servers/${props.name}/adopt`
const body = ref('Loading the planned changes...')
const error = ref('')

try {
  const plan = await $fetch<{ changes: { kind: string, name: string, add: Record<string, string> }[] }>(url, { method: 'POST', body: { confirm: false } })
  const lines = plan.changes.filter(c => Object.keys(c.add).length)
    .map(c => `${c.kind} ${c.name}: add ${Object.entries(c.add).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  body.value = lines.length ? `Only labels are added; the server is not restarted.\n${lines.join('\n')}` : 'Already adopted, nothing to change.'
}
catch {
  error.value = 'Could not load the adopt plan'
}

async function confirm() {
  try {
    await $fetch(url, { method: 'POST', body: { confirm: true } })
    emit('close')
  }
  catch {
    error.value = 'Adopt failed, check that the server did not restart'
  }
}
</script>

<template>
  <ConfirmDialog :title="`Adopt ${name}`" :body="body" :warnings="error ? [error] : []" @confirm="confirm" @cancel="emit('close')" />
</template>
