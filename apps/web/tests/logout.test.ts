// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from '../server/utils/logout'
import { createSession, lookupSession } from '../server/utils/sessions'
import { testDeps } from './helpers/auth'

let out: string[]
beforeEach(() => {
  out = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
    out.push(String(c))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

describe('logout', () => {
  it('destroys the session and logs logout with the username', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    logout(token, deps, '1.2.3.4')
    expect(lookupSession(token, deps)).toBeUndefined()
    expect(JSON.parse(out[0]!)).toMatchObject({ event: 'logout', username: 'alice', ip: '1.2.3.4' })
    expect(out.join('')).not.toContain(token)
  })

  it('is idempotent for unknown or missing tokens (no log, no throw)', () => {
    const { deps } = testDeps()
    expect(() => logout('unknown', deps)).not.toThrow()
    expect(() => logout(undefined, deps)).not.toThrow()
    expect(out).toEqual([])
  })

  it('logging out one of two sessions leaves the other valid', () => {
    const { deps } = testDeps()
    const a = createSession('alice', deps)
    const b = createSession('alice', deps)
    logout(a, deps)
    expect(lookupSession(a, deps)).toBeUndefined()
    expect(lookupSession(b, deps)).toEqual({ username: 'alice' })
  })
})
