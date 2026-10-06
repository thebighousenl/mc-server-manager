import { authLog } from '../utils/auth-log'
import { getAuthConfig } from '../utils/auth-config'
import { parseUsers } from '../utils/password'

// Fail-closed notice: with no valid operators nobody can sign in (FR-014).
export default defineNitroPlugin(() => {
  if (parseUsers(getAuthConfig().users).length === 0) {
    authLog('no_operators_configured', { level: 'error' })
  }
})
