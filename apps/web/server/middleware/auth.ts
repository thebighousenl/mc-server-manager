import { authorize } from '../utils/authorize'
import { getAuthConfig } from '../utils/auth-config'
import { SESSION_COOKIE } from '../utils/sessions'

// Thin adapter: every /api/** request except the public ones needs a valid session.
export default defineEventHandler((event) => {
  const result = authorize(
    {
      path: event.path,
      method: event.method,
      token: getCookie(event, SESSION_COOKIE),
      origin: getRequestHeader(event, 'origin'),
      host: getRequestHost(event),
    },
    { config: getAuthConfig(), now: Date.now },
  )
  if (!result.ok) throw createError({ statusCode: result.status, statusMessage: result.message })
  if (result.username) event.context.auth = { username: result.username }
})
