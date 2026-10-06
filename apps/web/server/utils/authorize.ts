import type { AuthDeps } from './auth-config'
import { authLog } from './auth-log'
import { parseUsers } from './password'
import { getSession } from './sessions'

export type AuthorizeResult = { ok: true, username?: string } | { ok: false, status: 401 | 403, message: string }

// Resolve encodings, backslashes, repeated slashes and dot segments so odd spellings of /api/... are still seen as API.
function normalize(rawPath: string): string | undefined {
  let p = rawPath.split(/[?#]/)[0]!
  try {
    for (let i = 0; i < 3 && /%/.test(p); i++) p = decodeURIComponent(p)
  }
  catch {
    return undefined
  }
  const segs: string[] = []
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '..') segs.pop()
    else if (seg && seg !== '.') segs.push(seg)
  }
  return `/${segs.join('/')}`
}

// Undecodable paths and anything that looks like /api (e.g. "/apix" does not) are treated as API: fail closed.
const isApi = (path: string) => {
  const n = normalize(path)
  return n === undefined || /^\/api(?![A-Za-z0-9_-])/i.test(n) || /^\/api(?![A-Za-z0-9_-])/i.test(path)
}

// Public API routes must match literally; only paths that are clearly not /api are public otherwise.
export function isPublic(rawPath: string, method: string): boolean {
  const path = rawPath.split('?')[0]!
  if (!isApi(path)) return true
  return (method === 'POST' && (path === '/api/auth/login' || path === '/api/auth/logout'))
    || (method === 'GET' && path === '/api/health')
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
