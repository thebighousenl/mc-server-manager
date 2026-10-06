<script setup lang="ts">
const labels = {
  healthy: { text: 'Back-end healthy', color: 'success' },
  unavailable: { text: 'Back-end unavailable', color: 'error' },
  unauthorized: { text: 'Back-end unauthorized', color: 'warning' },
  misconfigured: { text: 'Back-end misconfigured', color: 'warning' },
} as const

const { data } = await useFetch<{ status: keyof typeof labels }>('/api/health')
const badge = computed(() => labels[data.value?.status ?? 'unavailable'])
</script>

<template>
  <UContainer class="py-8">
    <h1 class="mb-4 text-2xl font-bold">MC Server Manager</h1>
    <UCard>
      <UBadge :color="badge.color" variant="subtle">{{ badge.text }}</UBadge>
    </UCard>
  </UContainer>
</template>
