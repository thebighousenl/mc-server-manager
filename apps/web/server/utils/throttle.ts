import type { AuthDeps } from './auth-config'

interface Counter {
  failures: number
  windowStart: number
  lockedUntil?: number
}

// Keys are `user:<name>` / `ip:<addr>`.
// ponytail: entries are never swept (bounded by distinct names/IPs tried); add a sweep if that grows.
const counters = new Map<string, Counter>()

export function recordFailure(key: string, deps: AuthDeps): void {
  const now = deps.now()
  let c = counters.get(key)
  if (!c || now - c.windowStart > deps.config.lockoutMs) {
    c = { failures: 0, windowStart: now }
    counters.set(key, c)
  }
  if (++c.failures >= deps.config.maxFailures) c.lockedUntil = c.windowStart + deps.config.lockoutMs
}

export function recordSuccess(key: string): void {
  counters.delete(key)
}

export function retryAfterSeconds(key: string, deps: AuthDeps): number {
  const until = counters.get(key)?.lockedUntil
  return until === undefined ? 0 : Math.max(0, Math.ceil((until - deps.now()) / 1000))
}

export function isLocked(key: string, deps: AuthDeps): boolean {
  const until = counters.get(key)?.lockedUntil
  return until !== undefined && deps.now() < until
}
