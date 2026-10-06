import { authLog } from '../utils/auth-log'
import { getAuthConfig } from '../utils/auth-config'
import { configProblems, parseUsers } from '../utils/password'

// Fail startup on a malformed NUXT_AUTH_USERS; with no valid operators nobody can sign in (FR-014).
export default defineNitroPlugin(() => {
  const { users } = getAuthConfig()
  const problems = configProblems(users)
  if (problems.length) throw new Error(`Invalid auth configuration:\n- ${problems.join('\n- ')}`)
  if (parseUsers(users).length === 0) {
    authLog('no_operators_configured', { level: 'error' })
  }
})
