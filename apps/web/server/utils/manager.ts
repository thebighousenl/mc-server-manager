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
