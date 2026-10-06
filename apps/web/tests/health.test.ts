// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { checkManager } from '../server/utils/manager'

const URL_ = 'http://manager.internal:3001'
const SECRET = 's3cret-s3cret-s3cret-s3cret-s3cret'

const reply = (status: number) => vi.fn().mockResolvedValue(new Response('{}', { status }))

describe('manager health relay (/api/health)', () => {
  it.each([
    [200, 'healthy'],
    [401, 'unauthorized'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('manager %i -> %s', async (code, status) => {
    expect(await checkManager(URL_, SECRET, reply(code))).toBe(status)
  })

  it('sends Bearer secret to <url>/health with a timeout signal', async () => {
    const f = reply(200)
    await checkManager(URL_, SECRET, f)
    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toBe(`${URL_}/health`)
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    new TypeError('fetch failed'),
    new DOMException('timed out', 'TimeoutError'),
  ])('rejected fetch (%s) -> unavailable', async (err) => {
    expect(await checkManager(URL_, SECRET, vi.fn().mockRejectedValue(err))).toBe('unavailable')
  })

  it.each([
    ['url', '', SECRET],
    ['secret', URL_, ''],
  ])('missing %s -> misconfigured, no fetch', async (_n, url, secret) => {
    const f = reply(200)
    expect(await checkManager(url, secret, f)).toBe('misconfigured')
    expect(f).not.toHaveBeenCalled()
  })

  it('result never contains the URL or secret', async () => {
    for (const code of [200, 401, 500]) {
      const out = JSON.stringify({ status: await checkManager(URL_, SECRET, reply(code)) })
      expect(out).not.toContain(SECRET)
      expect(out).not.toContain('manager.internal')
    }
  })
})
