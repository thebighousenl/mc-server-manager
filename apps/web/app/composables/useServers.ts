export interface Server {
  name: string
  worldName: string
  gameMode: string
  port: number | null
  state: 'stopped' | 'stopping' | 'starting' | 'running' | 'failing'
  desired: 'running' | 'stopped'
  protected: boolean
  managed: boolean
  ageSeconds: number
}
interface ServerList { servers: Server[], clusterOk: boolean, error?: string }

// Initial fetch, then live updates over SSE; reconnects with backoff when the stream drops.
export function useServers() {
  const servers = ref<Server[]>([])
  const clusterOk = ref(true)
  const error = ref('')
  const loaded = ref(false)
  let source: EventSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = 1000
  let stopped = false

  const apply = (d: ServerList) => {
    servers.value = d.servers
    clusterOk.value = d.clusterOk
    error.value = d.error ?? ''
  }
  const fail = (message: string) => {
    clusterOk.value = false
    error.value = message
  }

  function connect() {
    const es = source = new EventSource('/api/servers/events')
    es.addEventListener('servers', (e) => {
      delay = 1000
      apply(JSON.parse((e as MessageEvent).data))
    })
    es.onerror = (e) => {
      const data = (e as MessageEvent).data
      if (data) return fail(JSON.parse(data).message) // `event: error` from the manager, stream stays open
      es.close()
      if (stopped) return
      fail('connection lost, retrying')
      timer = setTimeout(connect, delay)
      delay = Math.min(delay * 2, 30_000)
    }
  }

  onMounted(async () => {
    try {
      apply(await $fetch<ServerList>('/api/servers'))
    }
    catch {
      fail('server list unavailable')
    }
    loaded.value = true
    if (!stopped) connect()
  })
  onBeforeUnmount(() => {
    stopped = true
    clearTimeout(timer)
    source?.close()
  })

  return { servers, clusterOk, error, loaded }
}
