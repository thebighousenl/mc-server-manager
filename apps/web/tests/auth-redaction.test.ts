// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticate } from '../server/utils/authenticate'
import { logout } from '../server/utils/logout'
import { testDeps, testUsers } from './helpers/auth'

afterEach(() => vi.restoreAllMocks())

describe('log redaction (SC-005)', () => {
  it('failed sign-in, sign-in and sign-out never log a password, hash or token', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      out.push(String(c))
      return true
    })
    const u = testUsers()
    const { deps } = testDeps()
    const ip = '10.9.8.7'

    await authenticate({ username: u.username, password: 'wrong-pass-9876', ip }, deps)
    const ok = await authenticate({ username: u.username, password: u.password, ip }, deps)
    expect(ok.status).toBe(200)
    const token = (ok as { token: string }).token
    logout(token, deps, ip)

    const raw = out.join('')
    expect(out.map(l => JSON.parse(l).event)).toEqual(['login_failure', 'login_success', 'logout'])
    for (const secret of ['wrong-pass-9876', u.password, u.passwordHash, token, 'scrypt$']) {
      expect(raw).not.toContain(secret)
    }
  })
})
