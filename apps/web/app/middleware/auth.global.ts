// UX redirect only; the Nitro middleware (server/middleware/auth.ts) is the actual gate.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return
  try {
    await $fetch('/api/auth/me', { headers: useRequestHeaders(['cookie']) })
  }
  catch {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
