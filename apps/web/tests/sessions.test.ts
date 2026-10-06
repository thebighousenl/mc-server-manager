// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cookieOptions, createSession, destroySession, lookupSession, SESSION_COOKIE } from '../server/utils/sessions'
import { testDeps } from './helpers/auth'

describe('sessions', () => {
  it('createSession returns a 32-byte base64url token', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  it('lookupSession returns the username and bumps lastSeenAt (idle timer restarts)', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const token = createSession('alice', deps)
    clock.advance(800)
    expect(lookupSession(token, deps)).toEqual({ username: 'alice' })
    clock.advance(800) // 1600 since creation, but only 800 since last use
    expect(lookupSession(token, deps)).toEqual({ username: 'alice' })
  })

  it('expires after idleTimeoutMs idle and deletes the entry', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const token = createSession('alice', deps)
    clock.advance(1001)
    expect(lookupSession(token, deps)).toEqual({ expired: true, username: 'alice' })
    expect(lookupSession(token, deps)).toBeUndefined()
  })

  it('expires at maxLifetimeMs even when active, and deletes the entry', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000, maxLifetimeMs: 2500 })
    const token = createSession('alice', deps)
    for (let i = 0; i < 2; i++) {
      clock.advance(900)
      lookupSession(token, deps)
    }
    clock.advance(900) // 2700 total, 900 idle
    expect(lookupSession(token, deps)).toMatchObject({ expired: true })
    expect(lookupSession(token, deps)).toBeUndefined()
  })

  it('sweeps abandoned expired sessions when a new one is created', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const old = createSession('alice', deps)
    clock.advance(1001)
    createSession('bob', deps)
    expect(lookupSession(old, deps)).toBeUndefined() // swept, not reported as expired
  })

  it('unknown token -> undefined', () => {
    const { deps } = testDeps()
    expect(lookupSession('nope', deps)).toBeUndefined()
  })

  it('destroySession removes it', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    destroySession(token)
    expect(lookupSession(token, deps)).toBeUndefined()
  })

  it('two sessions for one username are independent', () => {
    const { deps } = testDeps()
    const a = createSession('alice', deps)
    const b = createSession('alice', deps)
    expect(a).not.toBe(b)
    destroySession(a)
    expect(lookupSession(a, deps)).toBeUndefined()
    expect(lookupSession(b, deps)).toEqual({ username: 'alice' })
  })

  it('cookieOptions: HttpOnly, SameSite=Strict, Path=/, Secure only when asked', () => {
    expect(SESSION_COOKIE).toBe('mc_session')
    expect(cookieOptions(false)).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', secure: false })
    expect(cookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', secure: true })
  })
})
