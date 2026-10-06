// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cookieOptions, createSession, destroySession, getSession, SESSION_COOKIE } from '../server/utils/sessions'
import { testDeps } from './helpers/auth'

describe('sessions', () => {
  it('createSession returns a 32-byte base64url token', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  it('getSession returns the username and bumps lastSeenAt (idle timer restarts)', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const token = createSession('alice', deps)
    clock.advance(800)
    expect(getSession(token, deps)).toEqual({ username: 'alice' })
    clock.advance(800) // 1600 since creation, but only 800 since last use
    expect(getSession(token, deps)).toEqual({ username: 'alice' })
  })

  it('expires after idleTimeoutMs idle and deletes the entry', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const token = createSession('alice', deps)
    clock.advance(1001)
    expect(getSession(token, deps)).toEqual({ expired: true, username: 'alice' })
    expect(getSession(token, deps)).toBeUndefined()
  })

  it('expires at maxLifetimeMs even when active, and deletes the entry', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000, maxLifetimeMs: 2500 })
    const token = createSession('alice', deps)
    for (let i = 0; i < 2; i++) {
      clock.advance(900)
      getSession(token, deps)
    }
    clock.advance(900) // 2700 total, 900 idle
    expect(getSession(token, deps)).toMatchObject({ expired: true })
    expect(getSession(token, deps)).toBeUndefined()
  })

  it('unknown token -> undefined', () => {
    const { deps } = testDeps()
    expect(getSession('nope', deps)).toBeUndefined()
  })

  it('destroySession removes it', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    destroySession(token)
    expect(getSession(token, deps)).toBeUndefined()
  })

  it('two sessions for one username are independent', () => {
    const { deps } = testDeps()
    const a = createSession('alice', deps)
    const b = createSession('alice', deps)
    expect(a).not.toBe(b)
    destroySession(a)
    expect(getSession(a, deps)).toBeUndefined()
    expect(getSession(b, deps)).toEqual({ username: 'alice' })
  })

  it('cookieOptions: HttpOnly, SameSite=Strict, Path=/, Secure only when asked', () => {
    expect(SESSION_COOKIE).toBe('mc_session')
    expect(cookieOptions(false)).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', secure: false })
    expect(cookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', secure: true })
  })
})
