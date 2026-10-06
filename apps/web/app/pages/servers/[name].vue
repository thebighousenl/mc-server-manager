<script setup lang="ts">
const name = String(useRoute().params.name)
const { servers, clusterOk, error, loaded } = useServers()
const tab = ref<'overview' | 'console' | 'settings'>('overview')
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
      <div class="flex gap-2">
        <UButton data-testid="tab-overview" size="sm" :variant="tab === 'overview' ? 'solid' : 'outline'" @click="tab = 'overview'">Overview</UButton>
        <UButton data-testid="tab-console" size="sm" :variant="tab === 'console' ? 'solid' : 'outline'" @click="tab = 'console'">Console</UButton>
        <UButton data-testid="tab-settings" size="sm" :variant="tab === 'settings' ? 'solid' : 'outline'" @click="tab = 'settings'">Settings</UButton>
      </div>
      <LogPanel v-if="tab === 'overview'" :name="name" />
      <SettingsForm v-else-if="tab === 'settings'" :name="name" />
      <template v-else>
        <p v-if="server.state !== 'running'" class="text-sm text-muted">The console is available while the server is running.</p>
        <template v-else>
          <ConsolePanel :name="name" />
          <PlayerList :name="name" />
        </template>
      </template>
    </div>
  </UContainer>
</template>
