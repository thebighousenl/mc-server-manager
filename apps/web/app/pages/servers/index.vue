<script setup lang="ts">
const { servers, clusterOk, error, loaded } = useServers()
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Servers</h1>
      <div class="flex gap-2">
        <UButton to="/servers/new" data-testid="new-server">New server</UButton>
        <UButton to="/" color="neutral" variant="outline">Home</UButton>
      </div>
    </div>
    <UAlert v-if="!clusterOk" class="mb-4" color="error" variant="subtle" title="Cluster unavailable" :description="error" />
    <p v-else-if="loaded && !servers.length" data-testid="no-servers">No servers found.</p>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ServerCard v-for="s in servers" :key="s.name" :server="s" />
    </div>
  </UContainer>
</template>
