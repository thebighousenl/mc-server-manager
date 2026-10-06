export interface ServerRoute {
  method: string
  /** Browser path; `:name` must be a valid server name, any other `:param` is one plain path segment. */
  pattern: string
  /** Long-lived response (SSE or large download): no overall timeout. */
  stream?: boolean
}

// The only (method, path) pairs the gateway forwards to the manager. Story PRs add rows here; put literal rows (`/api/servers/events`) before `:name` rows.
export const serverRoutes: ServerRoute[] = [
  { method: 'GET', pattern: '/api/servers' },
]
