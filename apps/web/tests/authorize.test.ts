// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorize, isPublic } from '../server/utils/authorize'
import { createSession } from '../server/utils/sessions'
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

const base = { path: '/api/servers', method: 'GET', host: 'app.example', origin: undefined, token: undefined }

describe('isPublic', () => {
  it.each([
    ['POST', '/api/auth/login', true],
    ['GET', '/api/health', true],
    ['GET', '/', true],
    ['GET', '/login', true],
    ['GET', '/_nuxt/entry.js', true],
    ['GET', '/api/auth/login', false],
    ['POST', '/api/health', false],
    ['GET', '/api/auth/me', false],
    ['POST', '/api/auth/logout', true],
    ['GET', '/api/auth/logout', false],
    ['GET', '/api/servers', false],
    ['GET', '/api', false],
    ['GET', '/apix', true],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(isPublic(path, method)).toBe(expected)
  })

  it.each([
    '//api/auth/me', '/%61pi/auth/me', '/%2e/api/auth/me', '/api/../api/auth/me', '/./api/servers',
    '///api/servers', '/API/servers', '/api%2Fservers', '/\\api/servers', '/api/auth/me/', '/api/health/../servers',
    '//api/health', '/x/../api/servers',
  ])('odd path %s is not public', (path) => {
    expect(isPublic(path, 'GET')).toBe(false)
  })

  it('ignores a query string and a trailing slash trick', () => {
    expect(isPublic('/api/health?x=1', 'GET')).toBe(true)
    expect(isPublic('/api/health/../servers', 'GET')).toBe(false)
  })
})

describe('authorize', () => {
  it('public paths pass without a session', async () => {
    const { deps } = testDeps()
    expect(authorize({ ...base, path: '/api/health' }, deps)).toEqual({ ok: true })
  })

  it('no cookie / unknown token -> 401', () => {
    const { deps } = testDeps()
    expect(authorize(base, deps)).toMatchObject({ ok: false, status: 401 })
    expect(authorize({ ...base, token: 'bogus' }, deps)).toMatchObject({ ok: false, status: 401 })
  })

  it('valid session -> ok with username and refreshes the idle timer', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const token = createSession('alice', deps)
    clock.advance(800)
    expect(authorize({ ...base, token }, deps)).toEqual({ ok: true, username: 'alice' })
    clock.advance(800)
    expect(authorize({ ...base, token }, deps)).toEqual({ ok: true, username: 'alice' })
  })

  it('expired session -> 401 and logs session_expired', () => {
    const { deps, clock } = testDeps({ idleTimeoutMs: 1000 })
    const token = createSession('alice', deps)
    clock.advance(1001)
    expect(authorize({ ...base, token }, deps)).toMatchObject({ ok: false, status: 401 })
    expect(JSON.parse(out[0]!)).toMatchObject({ event: 'session_expired', username: 'alice' })
  })

  it('no configured users -> 401 even with a live session (fail closed)', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    const closed = { ...deps, config: { ...deps.config, users: '' } }
    expect(authorize({ ...base, token }, closed)).toMatchObject({ ok: false, status: 401 })
  })

  it('non-GET/HEAD with mismatched origin -> 403; matching origin passes', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    const post = { ...base, method: 'POST', token }
    expect(authorize({ ...post, origin: 'https://evil.example' }, deps)).toMatchObject({ ok: false, status: 403 })
    expect(authorize({ ...post, origin: undefined }, deps)).toMatchObject({ ok: false, status: 403 })
    expect(authorize({ ...post, origin: 'https://app.example' }, deps)).toEqual({ ok: true, username: 'alice' })
  })

  it('GET and HEAD skip the origin check', () => {
    const { deps } = testDeps()
    const token = createSession('alice', deps)
    for (const method of ['GET', 'HEAD']) {
      expect(authorize({ ...base, method, token, origin: 'https://evil.example' }, deps)).toMatchObject({ ok: true })
    }
  })

  it('unauthenticated mutating request is 401 (not 403)', () => {
    const { deps } = testDeps()
    expect(authorize({ ...base, method: 'DELETE', origin: 'https://evil.example' }, deps)).toMatchObject({ ok: false, status: 401 })
  })

  it('login with a mismatched origin -> 403', () => {
    const { deps } = testDeps()
    const r = authorize({ ...base, path: '/api/auth/login', method: 'POST', origin: 'https://evil.example' }, deps)
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it('logout is public even with an expired or missing session (origin still checked)', () => {
    const { deps } = testDeps()
    const logoutReq = { ...base, path: '/api/auth/logout', method: 'POST', token: 'stale' }
    expect(authorize({ ...logoutReq, origin: 'https://app.example' }, deps)).toEqual({ ok: true })
    expect(authorize({ ...logoutReq, origin: undefined }, deps)).toMatchObject({ ok: false, status: 403 })
  })

  it('public POST without Origin is 403', () => {
    const { deps } = testDeps()
    expect(authorize({ ...base, path: '/api/auth/login', method: 'POST' }, deps)).toMatchObject({ ok: false, status: 403 })
  })
})
