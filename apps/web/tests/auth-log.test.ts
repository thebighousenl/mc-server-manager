// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authLog } from '../server/utils/auth-log'

afterEach(() => vi.restoreAllMocks())

function capture(fn: () => void) {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  fn()
  return write.mock.calls.map(c => String(c[0]))
}

describe('authLog', () => {
  it('writes one JSON line with level, ts, event, username, ip', () => {
    const lines = capture(() => authLog('login_success', { username: 'alice', ip: '1.2.3.4' }))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.endsWith('\n')).toBe(true)
    const obj = JSON.parse(lines[0]!)
    expect(obj).toMatchObject({ level: 'info', event: 'login_success', username: 'alice', ip: '1.2.3.4' })
    expect(Number.isNaN(Date.parse(obj.ts))).toBe(false)
  })

  it('allows overriding level', () => {
    const [line] = capture(() => authLog('config_error', { level: 'error' }))
    expect(JSON.parse(line!).level).toBe('error')
  })

  it('drops password, passwordHash and token fields', () => {
    const [line] = capture(() =>
      authLog('login_failure', { username: 'a', password: 'hunter2', passwordHash: 'scrypt$x$y', token: 'tok' } as never),
    )
    expect(line).not.toMatch(/hunter2|scrypt|tok/)
    expect(Object.keys(JSON.parse(line!))).not.toEqual(expect.arrayContaining(['password']))
  })
})
