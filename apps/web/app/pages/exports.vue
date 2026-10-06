<script setup lang="ts">
interface ExportInfo { file: string, server: string, sizeBytes: number, createdAt: string }
const { data, error } = await useFetch<{ exports: ExportInfo[] }>('/api/exports')
const size = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Exports</h1>
      <UButton to="/servers" color="neutral" variant="outline">Servers</UButton>
    </div>
    <UAlert v-if="error" class="mb-4" color="error" variant="subtle" title="Could not load the exports" />
    <p v-else-if="data && !data.exports.length" data-testid="no-exports">No exports yet.</p>
    <ul class="space-y-2">
      <li v-for="e in data?.exports" :key="e.file" class="flex items-center justify-between text-sm">
        <span>{{ e.server }} <span class="text-muted">{{ e.createdAt }} / {{ size(e.sizeBytes) }}</span></span>
        <a :href="`/api/exports/${encodeURIComponent(e.file)}`" download>{{ e.file }}</a>
      </li>
    </ul>
  </UContainer>
</template>
