import { getAuthConfig } from '../../utils/auth-config'
import { lookupSession, SESSION_COOKIE } from '../../utils/sessions'

export default defineEventHandler((event) => {
  const token = getCookie(event, SESSION_COOKIE)
  const session = token && lookupSession(token, { config: getAuthConfig(), now: Date.now })
  if (!session || 'expired' in session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return { username: session.username }
})
