<script setup lang="ts">
const props = defineProps<{ name: string, protected: boolean }>()
const confirming = ref(false)
const error = ref('')

async function remove() {
  confirming.value = false
  error.value = ''
  try {
    await $fetch(`/api/servers/${props.name}`, { method: 'DELETE', body: { confirmName: props.name } })
    await navigateTo('/servers')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Deleting failed'
  }
}
</script>

<template>
  <div v-if="!protected">
    <UButton data-testid="delete" color="error" variant="outline" @click="confirming = true">Delete server</UButton>
    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" :title="error" />
    <ConfirmDialog
      v-if="confirming"
      class="mt-2"
      :title="`Delete ${name}`"
      :body="`The server stops and its world is deleted for good. The world is exported first and the delete is cancelled if the export fails. Download it afterwards from Exports.`"
      :require-text="name"
      @confirm="remove"
      @cancel="confirming = false"
    />
  </div>
</template>
