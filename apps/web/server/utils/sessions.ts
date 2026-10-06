import { randomBytes } from 'node:crypto'
import type { AuthDeps } from './auth-config'

export const SESSION_COOKIE = 'mc_session'

interface Session {
  username: string
  createdAt: number
  lastSeenAt: number
}

// ponytail: per-process memory (single replica); swap for a shared store to scale out.
const sessions = new Map<string, Session>()

export function createSession(username: string, deps: AuthDeps): string {
  const token = randomBytes(32).toString('base64url')
  const now = deps.now()
  for (const [t, s] of sessions) if (expired(s, now, deps)) sessions.delete(t) // sweep abandoned sessions
  sessions.set(token, { username, createdAt: now, lastSeenAt: now })
  return token
}

const expired = (s: Session, now: number, deps: AuthDeps) =>
  now - s.lastSeenAt > deps.config.idleTimeoutMs || now - s.createdAt > deps.config.maxLifetimeMs

export function getSession(token: string, deps: AuthDeps): { username: string } | { expired: true, username: string } | undefined {
  const s = sessions.get(token)
  if (!s) return undefined
  const now = deps.now()
  if (expired(s, now, deps)) {
    sessions.delete(token)
    return { expired: true, username: s.username }
  }
  s.lastSeenAt = now
  return { username: s.username }
}

export function destroySession(token: string): void {
  sessions.delete(token)
}

export function cookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: 'strict', path: '/', secure } as const
}
