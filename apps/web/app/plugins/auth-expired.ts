// A 401 from any API call mid-session (expired or revoked) sends the operator back to sign-in.
export default defineNuxtPlugin(() => {
  if (import.meta.server) return
  const router = useRouter() // captured here: composables are unavailable inside the async callback
  globalThis.$fetch = $fetch.create({
    onResponseError({ request, response }) {
      const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
      const { path, fullPath } = router.currentRoute.value
      if (response.status !== 401 || path === '/login' || new URL(url, location.href).pathname.startsWith('/api/auth/')) return
      void navigateTo(`/login?redirect=${encodeURIComponent(fullPath)}`)
    },
  })
})
