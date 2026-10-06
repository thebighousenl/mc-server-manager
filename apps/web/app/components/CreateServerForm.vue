<script setup lang="ts">
// Subset of the manager's rules (apps/manager/src/servers/validate.ts), mirrored from SettingsForm; the manager stays authoritative.
const intIn = (min: number, max: number) => (v: string) => /^\d{1,4}$/.test(v) && +v >= min && +v <= max
const FIELDS: Record<string, [(v: string) => boolean, string]> = {
  LEVEL_NAME: [v => /^[A-Za-z0-9 _.-]{1,64}$/.test(v), 'letters, digits, space, _ . -'],
  GAMEMODE: [v => ['survival', 'creative', 'adventure'].includes(v), 'survival, creative or adventure'],
  DIFFICULTY: [v => ['peaceful', 'easy', 'normal', 'hard'].includes(v), 'peaceful, easy, normal or hard'],
  MAX_PLAYERS: [intIn(1, 200), 'a number from 1 to 200'],
  // eslint-disable-next-line no-control-regex
  LEVEL_SEED: [v => v.length >= 1 && v.length <= 64 && !/[\x00-\x1f\x7f]/.test(v), '1-64 characters'],
}
const name = ref('')
const port = ref('')
const values = reactive<Record<string, string>>(Object.fromEntries(Object.keys(FIELDS).map(k => [k, ''])))
const errors = ref<string[]>([])
const error = ref('')
const confirming = ref(false)
const created = ref<{ port: number } | null>(null)
const outside = ref<boolean | null>(null)

const settings = computed(() => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')))

function submit() {
  error.value = ''
  errors.value = [
    ...(/^[a-z][a-z0-9-]{1,19}$/.test(name.value) && !name.value.endsWith('-') && !['events', 'new', 'exports'].includes(name.value) ? [] : ['name must be 2-20 lowercase letters, digits or dashes, starting with a letter']),
    ...(port.value === '' || (/^\d{5}$/.test(port.value) && +port.value >= 19132 && +port.value <= 19999) ? [] : ['port must be a number from 19132 to 19999, or empty for the next free one']),
    ...Object.entries(settings.value).flatMap(([k, v]) => FIELDS[k]![0](v) ? [] : [`${k} must be ${FIELDS[k]![1]}`]),
  ]
  confirming.value = !errors.value.length
}

async function confirm() {
  confirming.value = false
  try {
    const res = await $fetch<{ firewall: { port: number } }>('/api/servers', {
      method: 'POST',
      body: { name: name.value, ...(port.value ? { port: Number(port.value) } : {}), settings: settings.value, confirm: true },
    })
    created.value = res.firewall
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Creating the server failed'
  }
}

async function check() {
  outside.value = null
  outside.value = (await $fetch<{ reachable: boolean }>(`/api/servers/${name.value}/reachability`, { method: 'POST' })).reachable
}
</script>

<template>
  <div v-if="created">
    <UAlert color="success" variant="subtle" :title="`${name} was created`" />
    <p class="mt-2">Now open UDP {{ created.port }} in the node and provider firewall.</p>
    <UButton data-testid="check-outside" class="mt-2" @click="check">Check from outside</UButton>
    <p v-if="outside !== null" class="mt-2">{{ outside ? 'Reachable from outside' : 'Not reachable from outside yet' }}</p>
    <UButton :to="`/servers/${name}`" class="mt-2" color="neutral" variant="outline">Open server</UButton>
  </div>
  <div v-else>
    <div class="mb-2 grid grid-cols-3 items-center gap-2 text-sm">
      <label for="create-name">name (required)</label>
      <UInput id="create-name" v-model="name" data-testid="name" placeholder="2-20 lowercase letters, digits or dashes" class="col-span-2" />
      <label for="create-port">port (optional)</label>
      <UInput id="create-port" v-model="port" data-testid="port" placeholder="19132-19999, empty = next free" class="col-span-2" />
      <template v-for="(_, key) in FIELDS" :key="key">
        <label :for="`create-${key}`" class="font-mono">{{ key }} (optional)</label>
        <UInput :id="`create-${key}`" v-model="values[key]" :data-testid="`setting-${key}`" :placeholder="`${FIELDS[key]![1]}; empty = default`" class="col-span-2" />
      </template>
    </div>
    <UAlert v-for="e in errors" :key="e" class="mt-2" color="error" variant="subtle" :title="e" />
    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" :title="error" />
    <UButton data-testid="submit" class="mt-2" @click="submit">Create server</UButton>
    <ConfirmDialog
      v-if="confirming"
      class="mt-2"
      :title="`Create ${name}`"
      body="Creating a server restarts Traefik: all HTTP ingress on the cluster, not only Minecraft, is interrupted for a few seconds."
      @confirm="confirm"
      @cancel="confirming = false"
    />
  </div>
</template>
