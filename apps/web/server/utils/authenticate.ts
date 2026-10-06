import type { AuthDeps } from './auth-config'
import { authLog } from './auth-log'
import { dummyVerify, parseUsers, verifyPassword } from './password'
import { createSession } from './sessions'
import { isLocked, recordFailure, recordSuccess, retryAfterSeconds } from './throttle'

export type AuthResult =
  | { status: 200, username: string, token: string }
  | { status: 400 | 401, message: string }
  | { status: 429, message: string, retryAfter: number }

const MAX_FIELD = 256
const valid = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_FIELD

export async function authenticate(
  input: { username?: unknown, password?: unknown, ip?: string },
  deps: AuthDeps,
): Promise<AuthResult> {
  const { username, password, ip } = input
  if (!valid(username) || !valid(password)) return { status: 400, message: 'Invalid request' }

  const name = username.toLowerCase()
  // Both the username and the client IP are throttled, each independently.
  const keys = [`user:${name}`, ...(ip ? [`ip:${ip}`] : [])]

  const locked = keys.filter(k => isLocked(k, deps))
  if (locked.length) {
    authLog('login_locked', { username: name, ip })
    return { status: 429, message: 'Too many attempts', retryAfter: Math.max(...locked.map(k => retryAfterSeconds(k, deps))) }
  }

  const operator = parseUsers(deps.config.users).find(u => u.username === name)
  const ok = operator ? await verifyPassword(password, operator.passwordHash) : await dummyVerify()
  if (!ok) {
    for (const k of keys) recordFailure(k, deps)
    authLog('login_failure', { username: name, ip })
    return { status: 401, message: 'Invalid credentials' }
  }

  recordSuccess(`user:${name}`)
  authLog('login_success', { username: name, ip })
  return { status: 200, username: name, token: createSession(name, deps) }
}
