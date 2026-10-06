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

// The only place that reads managerUrl / managerSecret.
export function getManagerStatus() {
  const { managerUrl, managerSecret } = useRuntimeConfig()
  return checkManager(managerUrl, managerSecret)
}

// The only code (besides checkManager) that reads managerUrl / managerSecret: calls the manager as an operator.
export function managerFetch(
  path: string,
  init: RequestInit,
  operator: string,
  fetchFn: typeof fetch = fetch,
  conn: { managerUrl: string, managerSecret: string } = useRuntimeConfig(),
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${conn.managerSecret}`)
  headers.set('X-Operator', operator)
  return fetchFn(new URL(path, conn.managerUrl), { ...init, headers })
}
