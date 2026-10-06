export interface AuthConfig {
  users: string
  idleTimeoutMs: number
  maxLifetimeMs: number
  maxFailures: number
  lockoutMs: number
  trustProxy: boolean
}

export interface AuthDeps {
  config: AuthConfig
  now: () => number
}

// The only place that reads runtimeConfig.auth.
export function getAuthConfig(): AuthConfig {
  const auth = useRuntimeConfig().auth as Omit<AuthConfig, 'users'> & { users: unknown }
  // Nitro env parsing turns NUXT_AUTH_USERS='[...]' into an array; keep the JSON-string contract.
  const users = typeof auth.users === 'string' ? auth.users : JSON.stringify(auth.users ?? [])
  return { ...auth, users }
}
