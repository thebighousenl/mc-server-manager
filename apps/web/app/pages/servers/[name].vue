<script setup lang="ts">
const name = String(useRoute().params.name)
const { servers, clusterOk, error, loaded } = useServers()
const server = computed(() => servers.value.find(s => s.name === name))
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ name }}</h1>
      <UButton to="/servers" color="neutral" variant="outline">Servers</UButton>
    </div>
    <UAlert v-if="!clusterOk" class="mb-4" color="error" variant="subtle" title="Cluster unavailable" :description="error" />
    <p v-else-if="loaded && !server" data-testid="not-found">No server named {{ name }}.</p>
    <div v-else-if="server" class="space-y-4">
      <UBadge data-testid="state-badge" variant="subtle">{{ server.state }}</UBadge>
      <LifecycleControls :name="name" :state="server.state" />
      <LogPanel :name="name" />
    </div>
  </UContainer>
</template>
