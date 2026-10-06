<script setup lang="ts">
const props = defineProps<{ name: string }>()
const players = ref<{ online: number, max: number, players: string[] } | null>(null)
const error = ref('')

async function refresh() {
  error.value = ''
  try {
    players.value = await $fetch(`/api/servers/${props.name}/players`)
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'players unavailable'
  }
}
onMounted(refresh)
</script>

<template>
  <div>
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">Players <span v-if="players">{{ players.online }}/{{ players.max }}</span></h3>
      <UButton size="sm" variant="outline" color="neutral" @click="refresh">Refresh</UButton>
    </div>
    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" :title="error" />
    <ul class="mt-2 text-sm">
      <li v-for="p in players?.players" :key="p">{{ p }}</li>
    </ul>
  </div>
</template>
