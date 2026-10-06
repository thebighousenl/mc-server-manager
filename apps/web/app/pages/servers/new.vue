<template>
  <UContainer class="py-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">New server</h1>
      <UButton to="/servers" color="neutral" variant="outline">Servers</UButton>
    </div>
    <CreateServerForm />
  </UContainer>
</template>
