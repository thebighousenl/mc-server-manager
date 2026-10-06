import { getAuthConfig } from '../../utils/auth-config'
import { logout } from '../../utils/logout'
import { cookieOptions, SESSION_COOKIE } from '../../utils/sessions'

export default defineEventHandler((event) => {
  const config = getAuthConfig()
  logout(
    getCookie(event, SESSION_COOKIE),
    { config, now: Date.now },
    getRequestIP(event, { xForwardedFor: config.trustProxy }),
  )
  deleteCookie(event, SESSION_COOKIE, cookieOptions(!import.meta.dev))
  return sendNoContent(event)
})
