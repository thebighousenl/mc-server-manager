<script setup lang="ts">
const props = defineProps<{ name: string }>()
interface Setting { key: string, value: string, editable: boolean }

// Mirrors the manager's allow-list rules (apps/manager/src/servers/validate.ts); the manager stays authoritative.
const intIn = (min: number, max: number) => (v: string) => /^\d{1,4}$/.test(v) && +v >= min && +v <= max
const oneOf = (...values: string[]) => (v: string) => values.includes(v)
const bool = oneOf('true', 'false')
const text = (max: number) => (v: string) => v.length >= 1 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v)
const RULES: Record<string, [(v: string) => boolean, string]> = {
  SERVER_NAME: [text(64), '1-64 characters'],
  LEVEL_NAME: [v => /^[A-Za-z0-9 _.-]{1,64}$/.test(v), 'letters, digits, space, _ . -'],
  GAMEMODE: [oneOf('survival', 'creative', 'adventure'), 'survival, creative or adventure'],
  DIFFICULTY: [oneOf('peaceful', 'easy', 'normal', 'hard'), 'peaceful, easy, normal or hard'],
  MAX_PLAYERS: [intIn(1, 200), 'a number from 1 to 200'],
  ALLOW_CHEATS: [bool, 'true or false'],
  ONLINE_MODE: [bool, 'true or false'],
  ALLOW_LIST: [bool, 'true or false'],
  ALLOW_LIST_USERS: [v => /^[^:,\s][^:,]{0,31}:\d+(,[^:,\s][^:,]{0,31}:\d+)*$/.test(v), 'name:xuid,name:xuid'],
  OPS: [v => /^\d+(,\d+)*$/.test(v), 'xuid,xuid'],
  DEFAULT_PLAYER_PERMISSION_LEVEL: [oneOf('visitor', 'member', 'operator'), 'visitor, member or operator'],
  VIEW_DISTANCE: [intIn(5, 96), 'a number from 5 to 96'],
  TICK_DISTANCE: [intIn(4, 12), 'a number from 4 to 12'],
  VERSION: [v => v === 'LATEST' || /^\d+(\.\d+){2,3}$/.test(v), 'LATEST or a version like 1.21.50.07'],
}

const settings = ref<Setting[]>([])
const resourceVersion = ref('')
const values = reactive<Record<string, string>>({})
const errors = ref<string[]>([])
const result = ref<string[]>([])
const error = ref('')
const confirming = ref(false)

async function load() {
  const d = await $fetch<{ settings: Setting[], resourceVersion: string }>(`/api/servers/${props.name}`)
  settings.value = d.settings
  resourceVersion.value = d.resourceVersion
  for (const s of d.settings) values[s.key] = s.value
}
onMounted(() => load().catch(() => { error.value = 'Could not load the settings' }))

const changed = computed(() => Object.fromEntries(settings.value.filter(s => s.editable && values[s.key] !== s.value).map(s => [s.key, values[s.key]!])))
const warnings = computed(() => {
  const version = changed.value.VERSION ?? settings.value.find(s => s.key === 'VERSION')?.value
  return !version || version === 'LATEST' ? ['VERSION is LATEST: the newest server version is pulled on start and may irreversibly upgrade the world.'] : []
})

function save() {
  error.value = ''
  result.value = []
  errors.value = Object.entries(changed.value).flatMap(([k, v]) => RULES[k] && !RULES[k][0](v) ? [`${k} must be ${RULES[k][1]}`] : [])
  confirming.value = !errors.value.length && Object.keys(changed.value).length > 0
}

async function confirm() {
  confirming.value = false
  try {
    const res = await $fetch<{ warnings: string[] }>(`/api/servers/${props.name}/settings`, {
      method: 'PUT',
      body: { settings: changed.value, resourceVersion: resourceVersion.value, confirm: true },
    })
    result.value = res.warnings
    await load()
  }
  catch (e) {
    error.value = (e as { statusCode?: number, data?: { message?: string } }).statusCode === 409
      ? 'These settings changed elsewhere, reload the page and try again'
      : (e as { data?: { message?: string } }).data?.message ?? 'Saving failed'
  }
}
</script>

<template>
  <div>
    <div v-for="s in settings" :key="s.key" class="mb-2 grid grid-cols-3 items-center gap-2 text-sm">
      <label :for="`setting-${s.key}`" class="font-mono">{{ s.key }}</label>
      <UInput v-if="s.editable" v-model="values[s.key]" :data-testid="`setting-${s.key}`" :id="`setting-${s.key}`" class="col-span-2" />
      <span v-else class="col-span-2 text-muted">{{ s.value }}</span>
    </div>
    <UAlert v-for="e in errors" :key="e" class="mt-2" color="error" variant="subtle" :title="e" />
    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" :title="error" />
    <UAlert v-for="w in result" :key="w" class="mt-2" color="warning" variant="subtle" :title="w" />
    <UButton data-testid="save" class="mt-2" @click="save">Save</UButton>
    <ConfirmDialog
      v-if="confirming"
      class="mt-2"
      :title="`Save settings for ${name}`"
      :body="`The server will restart to apply: ${Object.keys(changed).join(', ')}. Players are disconnected.`"
      :warnings="warnings"
      @confirm="confirm"
      @cancel="confirming = false"
    />
  </div>
</template>
