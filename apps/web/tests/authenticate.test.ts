// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDeps, testUsers } from './helpers/auth'

type Authenticate = typeof import('../server/utils/authenticate').authenticate
let authenticate: Authenticate
let out: string[]

beforeEach(async () => {
  vi.resetModules() // fresh throttle/session state per test
  ;({ authenticate } = await import('../server/utils/authenticate'))
  out = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
    out.push(String(c))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

const u = testUsers()
const ip = '10.0.0.1'
const events = () => out.map(l => JSON.parse(l))

describe('authenticate', () => {
  it('valid credentials -> 200 with username and a session token', async () => {
    const { deps } = testDeps()
    const r = await authenticate({ username: u.username, password: u.password, ip }, deps)
    expect(r).toMatchObject({ status: 200, username: 'alice' })
    expect(typeof (r as { token: string }).token).toBe('string')
    const sessions = await import('../server/utils/sessions')
    expect(sessions.getSession((r as { token: string }).token, deps)).toEqual({ username: 'alice' })
  })

  it('username is matched case-insensitively', async () => {
    const { deps } = testDeps()
    expect(await authenticate({ username: 'ALICE', password: u.password, ip }, deps)).toMatchObject({ status: 200, username: 'alice' })
  })

  it('wrong password and unknown user give the identical 401', async () => {
    const { deps } = testDeps()
    const wrong = await authenticate({ username: u.username, password: 'nope', ip }, deps)
    const unknown = await authenticate({ username: 'mallory', password: 'nope', ip }, deps)
    expect(wrong).toEqual({ status: 401, message: 'Invalid credentials' })
    expect(unknown).toEqual(wrong)
  })

  it('no configured users -> 401 (fail closed)', async () => {
    const { deps } = testDeps({ users: '' })
    expect(await authenticate({ username: 'alice', password: u.password, ip }, deps)).toEqual({ status: 401, message: 'Invalid credentials' })
  })

  it.each([
    [{ username: 1, password: 'x' }],
    [{ username: 'a', password: {} }],
    [{ username: '', password: 'x' }],
    [{ username: 'a', password: '' }],
    [{ username: 'a'.repeat(257), password: 'x' }],
    [{ username: 'a', password: 'x'.repeat(257) }],
    [{}],
  ])('malformed input %j -> 400', async (body) => {
    const { deps } = testDeps()
    const r = await authenticate({ ...(body as object), ip } as never, deps)
    expect(r.status).toBe(400)
  })

  it('logs login_success / login_failure with username and ip, no secrets', async () => {
    const { deps } = testDeps()
    await authenticate({ username: u.username, password: 'wrong-pw-123', ip }, deps)
    const ok = await authenticate({ username: u.username, password: u.password, ip }, deps)
    const log = events()
    expect(log.map(e => e.event)).toEqual(['login_failure', 'login_success'])
    expect(log[0]).toMatchObject({ username: 'alice', ip })
    const raw = out.join('')
    for (const secret of ['wrong-pw-123', u.password, u.passwordHash, (ok as { token: string }).token]) {
      expect(raw).not.toContain(secret)
    }
  })

  it('result never contains the hash or password', async () => {
    const { deps } = testDeps()
    for (const password of [u.password, 'bad-password-xyz']) {
      const raw = JSON.stringify(await authenticate({ username: u.username, password, ip }, deps))
      expect(raw).not.toContain(u.passwordHash)
      expect(raw).not.toContain(password)
    }
  })
})
