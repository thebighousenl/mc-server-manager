export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  // Private (server-only) config; overridden by NUXT_MANAGER_URL / NUXT_MANAGER_SECRET.
  runtimeConfig: {
    managerUrl: '',
    managerSecret: '',
    // Server-only auth settings; overridden by NUXT_AUTH_USERS, NUXT_AUTH_IDLE_TIMEOUT_MS, etc.
    auth: {
      users: '', // JSON string: [{ "username": "...", "passwordHash": "scrypt$..." }]
      idleTimeoutMs: 1800000,
      maxLifetimeMs: 43200000,
      maxFailures: 5,
      lockoutMs: 300000,
      trustProxy: false,
    },
  },
  compatibilityDate: '2026-01-01',
})
