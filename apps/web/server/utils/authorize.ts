import type { AuthDeps } from './auth-config'
import { authLog } from './auth-log'
import { parseUsers } from './password'
import { getSession } from './sessions'

export type AuthorizeResult = { ok: true, username?: string } | { ok: false, status: 401 | 403, message: string }

// Anything that is not clearly outside /api (e.g. "/apix") is treated as an API path: fail closed.
const isApi = (path: string) => /^\/api(?![A-Za-z0-9_-])/i.test(path)

export function isPublic(rawPath: string, method: string): boolean {
  const path = rawPath.split('?')[0]!
  if (!isApi(path)) return true
  return (method === 'POST' && path === '/api/auth/login') || (method === 'GET' && path === '/api/health')
}

function originMatches(origin: string | undefined, host: string): boolean {
  if (!origin) return false
  try {
    return new URL(origin).host === host
  }
  catch {
    return false
  }
}

export function authorize(
  req: { path: string, method: string, token?: string, origin?: string, host: string },
  deps: AuthDeps,
): AuthorizeResult {
  const mutating = req.method !== 'GET' && req.method !== 'HEAD'
  const originOk = !mutating || !isApi(req.path) || originMatches(req.origin, req.host)
  const forbidden = { ok: false, status: 403, message: 'Forbidden' } as const

  if (isPublic(req.path, req.method)) return originOk ? { ok: true } : forbidden

  const unauthorized = { ok: false, status: 401, message: 'Unauthorized' } as const
  if (!req.token || parseUsers(deps.config.users).length === 0) return unauthorized
  const session = getSession(req.token, deps)
  if (!session) return unauthorized
  if ('expired' in session) {
    authLog('session_expired', { username: session.username })
    return unauthorized
  }
  return originOk ? { ok: true, username: session.username } : forbidden
}
