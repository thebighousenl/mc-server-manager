<script setup lang="ts">
const labels = {
  healthy: { text: 'Back-end healthy', color: 'success' },
  unavailable: { text: 'Back-end unavailable', color: 'error' },
  unauthorized: { text: 'Back-end unauthorized', color: 'warning' },
  misconfigured: { text: 'Back-end misconfigured', color: 'warning' },
} as const

const { data } = await useFetch<{ status: keyof typeof labels }>('/api/health')
const badge = computed(() => labels[data.value?.status ?? 'unavailable'])

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">MC Server Manager</h1>
      <UButton color="neutral" variant="outline" @click="signOut">Sign out</UButton>
    </div>
    <UCard>
      <UBadge :color="badge.color" variant="subtle">{{ badge.text }}</UBadge>
    </UCard>
  </UContainer>
</template>
