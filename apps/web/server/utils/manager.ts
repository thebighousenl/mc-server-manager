export type WebHealthStatus = 'healthy' | 'unavailable' | 'unauthorized' | 'misconfigured'

// Maps a manager /health call to the browser-safe status; never throws, never exposes url/secret.
export async function checkManager(
  managerUrl: string,
  managerSecret: string,
  fetchFn: typeof fetch = fetch,
): Promise<WebHealthStatus> {
  if (!managerUrl || !managerSecret) return 'misconfigured'
  try {
    const res = await fetchFn(new URL('/health', managerUrl), {
      headers: { Authorization: `Bearer ${managerSecret}` },
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) return 'healthy'
    return res.status === 401 ? 'unauthorized' : 'unavailable'
  }
  catch {
    return 'unavailable'
  }
}

export interface ManagerDeps {
  managerUrl: string
  managerSecret: string
  fetch: typeof fetch
}

// Call the manager with the shared secret and the operator name (audit log). `path` is built by the gateway, never by the client.
export function managerFetch(
  path: string,
  init: RequestInit,
  operator: string,
  deps: ManagerDeps = { ...useRuntimeConfig(), fetch },
): Promise<Response> {
  const base = new URL(deps.managerUrl)
  const url = new URL(path, base)
  if (url.origin !== base.origin) throw new Error('manager path escaped the manager origin')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${deps.managerSecret}`)
  headers.set('X-Operator', operator)
  return deps.fetch(url, { ...init, headers, redirect: 'manual' })
}

// The only place that reads managerUrl / managerSecret (with managerFetch).
export function getManagerStatus() {
  const { managerUrl, managerSecret } = useRuntimeConfig()
  return checkManager(managerUrl, managerSecret)
}
