import { authenticate } from '../../utils/authenticate'
import { getAuthConfig } from '../../utils/auth-config'
import { cookieOptions, SESSION_COOKIE } from '../../utils/sessions'

export default defineEventHandler(async (event) => {
  const config = getAuthConfig()
  const body = await readBody(event).catch(() => undefined)
  const result = await authenticate(
    {
      username: body?.username,
      password: body?.password,
      ip: getRequestIP(event, { xForwardedFor: config.trustProxy }),
    },
    { config, now: Date.now },
  )

  if (result.status !== 200) {
    if ('retryAfter' in result) setResponseHeader(event, 'Retry-After', result.retryAfter)
    throw createError({ statusCode: result.status, statusMessage: result.message })
  }

  setCookie(event, SESSION_COOKIE, result.token, cookieOptions(!import.meta.dev))
  return { username: result.username }
})
