// A 401 from any API call mid-session (expired or revoked) sends the operator back to sign-in.
export default defineNuxtPlugin(() => {
  if (import.meta.server) return
  globalThis.$fetch = $fetch.create({
    onResponseError({ request, response }) {
      const route = useRoute()
      if (response.status !== 401 || String(request).startsWith('/api/auth/') || route.path === '/login') return
      void navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
    },
  })
})
