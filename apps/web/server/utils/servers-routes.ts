// The only browser-callable manager routes. Story PRs add rows; `:name` is validated by the gateway.
export interface ServerRoute { method: string, pattern: string, stream?: boolean }

export const routes: ServerRoute[] = [
  { method: 'GET', pattern: '/api/servers' },
  { method: 'GET', pattern: '/api/servers/events', stream: true }, // before :name
  { method: 'GET', pattern: '/api/servers/:name' },
  { method: 'POST', pattern: '/api/servers/:name/adopt' },
  { method: 'POST', pattern: '/api/servers/:name/start' },
  { method: 'POST', pattern: '/api/servers/:name/stop' },
  { method: 'POST', pattern: '/api/servers/:name/restart' },
  { method: 'GET', pattern: '/api/servers/:name/logs', stream: true },
]
