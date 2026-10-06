export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  // Private (server-only) config; overridden by NUXT_MANAGER_URL / NUXT_MANAGER_SECRET.
  runtimeConfig: {
    managerUrl: '',
    managerSecret: '',
  },
  compatibilityDate: '2026-01-01',
})
