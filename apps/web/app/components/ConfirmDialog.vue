<script setup lang="ts">
const props = defineProps<{ title: string, body: string, warnings?: string[], requireText?: string }>()
defineEmits<{ confirm: [], cancel: [] }>()
const typed = ref('')
const blocked = computed(() => props.requireText !== undefined && typed.value !== props.requireText)
</script>

<template>
  <UCard role="dialog" :aria-label="title">
    <template #header>
      <h2 class="text-lg font-semibold">{{ title }}</h2>
    </template>
    <p class="whitespace-pre-line">{{ body }}</p>
    <UAlert v-for="w in warnings" :key="w" class="mt-2" color="warning" variant="subtle" :title="w" />
    <UInput v-if="requireText !== undefined" v-model="typed" class="mt-2 w-full" :placeholder="`Type ${requireText} to confirm`" />
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton data-testid="cancel" color="neutral" variant="outline" @click="$emit('cancel')">Cancel</UButton>
        <UButton data-testid="confirm" color="error" :disabled="blocked" @click="$emit('confirm')">Confirm</UButton>
      </div>
    </template>
  </UCard>
</template>
