<script setup lang="ts">
const props = defineProps<{ name: string }>()
const lines = ref<string[]>([])
let source: EventSource | undefined

onMounted(() => {
  source = new EventSource(`/api/servers/${props.name}/logs?follow=1&tail=200`)
  source.addEventListener('message', (e) => {
    lines.value = [...lines.value, (e as MessageEvent).data].slice(-1000)
  })
})
onBeforeUnmount(() => source?.close())
</script>

<template>
  <pre data-testid="logs" class="max-h-96 overflow-auto rounded bg-elevated p-2 text-xs">{{ lines.join('\n') }}</pre>
</template>
