<script setup lang="ts">
const route = useRoute()
const state = reactive({ username: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: state })
    await navigateTo(safeRedirect(route.query.redirect))
  }
  catch (e) {
    error.value = (e as { statusCode?: number }).statusCode === 429
      ? 'Too many attempts, try again later'
      : 'Invalid credentials'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="flex min-h-screen items-center justify-center py-8">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold">Sign in</h1>
      </template>
      <UForm :state="state" class="space-y-4" @submit="submit">
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
        <UFormField label="Username" name="username" required>
          <UInput v-model="state.username" autocomplete="username" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Password" name="password" required>
          <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" block :loading="loading">Sign in</UButton>
      </UForm>
    </UCard>
  </UContainer>
</template>
