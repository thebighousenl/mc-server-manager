// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDeps, testUsers } from './helpers/auth'

type Authenticate = typeof import('../server/utils/authenticate').authenticate
let authenticate: Authenticate
let out: string[]

beforeEach(async () => {
  vi.resetModules()
  ;({ authenticate } = await import('../server/utils/authenticate'))
  out = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
    out.push(String(c))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

const u = testUsers()
const good = (ip: string) => ({ username: u.username, password: u.password, ip })
const bad = (ip: string, username = u.username) => ({ username, password: 'wrong-password', ip })

describe('authenticate lockout', () => {
  it('6th attempt after 5 failures is 429 even with the correct password, and logs login_locked', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < 5; i++) expect(await authenticate(bad('10.0.0.1'), deps)).toMatchObject({ status: 401 })
    const r = await authenticate(good('10.0.0.1'), deps)
    expect(r).toMatchObject({ status: 429, message: 'Too many attempts' })
    expect((r as { retryAfter: number }).retryAfter).toBeGreaterThan(0)
    expect(out.map(l => JSON.parse(l).event)).toContain('login_locked')
  })

  it('correct sign-in works again after lockoutMs', async () => {
    const { deps, clock } = testDeps({ lockoutMs: 10_000 })
    for (let i = 0; i < 5; i++) await authenticate(bad('10.0.0.1'), deps)
    expect(await authenticate(good('10.0.0.1'), deps)).toMatchObject({ status: 429 })
    clock.advance(10_001)
    expect(await authenticate(good('10.0.0.1'), deps)).toMatchObject({ status: 200 })
  })

  it('a username is locked across different IPs', async () => {
    const { deps } = testDeps()
    for (let i = 1; i <= 5; i++) await authenticate(bad(`10.0.0.${i}`), deps)
    expect(await authenticate(good('10.0.0.99'), deps)).toMatchObject({ status: 429 })
  })

  it('one IP locks only itself, not other IPs', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < 5; i++) await authenticate(bad('10.0.0.1', `user${i}`), deps)
    expect(await authenticate(good('10.0.0.1'), deps)).toMatchObject({ status: 429 })
    expect(await authenticate(good('10.0.0.2'), deps)).toMatchObject({ status: 200 })
  })

  it('failures for unknown usernames also count (no 401/429 enumeration)', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < 5; i++) await authenticate(bad('10.0.0.1', 'ghost'), deps)
    const r = await authenticate({ username: 'ghost', password: 'x', ip: '10.0.0.2' }, deps)
    expect(r).toMatchObject({ status: 429 })
  })

  it('a success clears the username counter', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < 4; i++) await authenticate(bad(`10.0.0.${i + 1}`), deps)
    expect(await authenticate(good('10.0.1.1'), deps)).toMatchObject({ status: 200 })
    await authenticate(bad('10.0.2.1'), deps)
    expect(await authenticate(good('10.0.2.2'), deps)).toMatchObject({ status: 200 })
  })

  it('lock log line has no secrets', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < 6; i++) await authenticate(bad('10.0.0.1'), deps)
    expect(out.join('')).not.toContain('wrong-password')
  })
})
