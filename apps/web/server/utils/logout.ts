import type { AuthDeps } from './auth-config'
import { authLog } from './auth-log'
import { destroySession, lookupSession } from './sessions'

// Idempotent: an unknown or missing token is a no-op.
export function logout(token: string | undefined, deps: AuthDeps, ip?: string): void {
  if (!token) return
  const session = lookupSession(token, deps)
  destroySession(token)
  if (session && !('expired' in session)) authLog('logout', { username: session.username, ip })
}
