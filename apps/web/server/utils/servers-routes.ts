// The only browser-callable manager routes. Story PRs add rows; `:name` is validated by the gateway.
export interface ServerRoute { method: string, pattern: string, stream?: boolean }

export const routes: ServerRoute[] = [
  { method: 'GET', pattern: '/api/servers' },
  { method: 'GET', pattern: '/api/servers/events', stream: true }, // before :name
  { method: 'GET', pattern: '/api/servers/:name' },
  { method: 'POST', pattern: '/api/servers/:name/adopt' },
]
