// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { authorize } from '../server/utils/authorize'
import { managerFetch } from '../server/utils/manager'
import { forward } from '../server/utils/servers-gateway'
import { testDeps } from './helpers/auth'

const ok = (body = '{}', headers: Record<string, string> = { 'content-type': 'application/json' }, status = 200) =>
  new Response(body, { status, headers })
const gateway = (res: Response | Error = ok()) => {
  const fetch = vi.fn(async (..._a: unknown[]) => {
    if (res instanceof Error) throw res
    return res
  })
  return { fetch, deps: { managerFetch: fetch } }
}
const req = (path: string, over: Record<string, unknown> = {}) => ({ method: 'GET', path, operator: 'alice', ...over })

describe('forward', () => {
  it('forwards a listed route to the manager path without /api, with the operator', async () => {
    const { fetch, deps } = gateway(ok('{"servers":[]}'))
    const res = await forward(req('/api/servers'), deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ servers: [] })
    const [path, init, operator] = fetch.mock.calls[0]! as [string, RequestInit, string]
    expect(path).toBe('/servers')
    expect(init.method).toBe('GET')
    expect(operator).toBe('alice')
  })

  it.each([
    ['GET', '/api/unknown'],
    ['POST', '/api/servers'],
    ['DELETE', '/api/servers'],
    ['GET', '/api/servers/extra/segments'],
    ['GET', '/apix/servers'],
    ['GET', '//evil.example/api/servers'],
  ])('%s %s is 404 without calling the manager', async (method, path) => {
    const { fetch, deps } = gateway()
    expect((await forward(req(path, { method }), deps)).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not build the manager URL from the client request', async () => {
    const { fetch, deps } = gateway()
    await forward(req('/api/servers?x=1&y=%2F..%2F'), deps)
    const [path] = fetch.mock.calls[0]! as [string]
    expect(path).toBe('/servers?x=1&y=%2F..%2F')
    expect(path.startsWith('/servers')).toBe(true)
  })

  it('strips set-cookie and headers outside the allow-list', async () => {
    const { deps } = gateway(ok('{}', { 'content-type': 'application/json', 'set-cookie': 'a=b', 'x-internal': '1', server: 'fastify' }))
    const res = await forward(req('/api/servers'), deps)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-internal')).toBeNull()
    expect(res.headers.get('server')).toBeNull()
    expect(res.headers.get('content-type')).toBe('application/json')
  })

  it.each([500, 502, 503])('manager %i becomes 502 unavailable', async (status) => {
    const { deps } = gateway(ok('{"error":"x","stderr":"secret"}', undefined, status))
    const res = await forward(req('/api/servers'), deps)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('manager 401 (bad shared secret) becomes 502 unavailable, not a logout', async () => {
    const { deps } = gateway(ok('{}', undefined, 401))
    expect((await forward(req('/api/servers'), deps)).status).toBe(502)
  })

  it('manager 4xx passes through', async () => {
    const { deps } = gateway(ok('{"error":"not_found"}', { 'content-type': 'application/json' }, 404))
    expect((await forward(req('/api/servers'), deps)).status).toBe(404)
  })

  it('network errors become 502 unavailable', async () => {
    const { deps } = gateway(new TypeError('fetch failed'))
    const res = await forward(req('/api/servers'), deps)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('streams text/event-stream through unbuffered', async () => {
    const { routes } = await import('../server/utils/servers-routes')
    routes.push({ method: 'GET', pattern: '/api/servers/test-stream', stream: true })
    try {
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c } })
      const { deps } = gateway(new Response(body, { headers: { 'content-type': 'text/event-stream' } }))
      const res = await forward(req('/api/servers/test-stream'), deps)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
      const reader = res.body!.getReader()
      controller.enqueue(new TextEncoder().encode('event: servers\n\n'))
      expect(new TextDecoder().decode((await reader.read()).value)).toBe('event: servers\n\n')
    }
    finally {
      routes.pop()
    }
  })

  describe(':name routes', () => {
    const withNameRoute = async (fn: () => Promise<void>) => {
      const { routes } = await import('../server/utils/servers-routes')
      routes.push({ method: 'POST', pattern: '/api/servers/:name/test' })
      try {
        await fn()
      }
      finally {
        routes.pop()
      }
    }

    it('forwards a valid name with a JSON body', async () => {
      await withNameRoute(async () => {
        const { fetch, deps } = gateway()
        await forward(req('/api/servers/zz-test/test', { method: 'POST', body: '{"confirm":true}', contentType: 'application/json' }), deps)
        const [path, init] = fetch.mock.calls[0]! as [string, RequestInit]
        expect(path).toBe('/servers/zz-test/test')
        expect(init.body).toBe('{"confirm":true}')
        expect(new Headers(init.headers).get('content-type')).toBe('application/json')
      })
    })

    it.each(['Bad_Name', 'a', '..', '%2e%2e', 'x'.repeat(21), 'a b'])('rejects name %j with 400 without calling the manager', async (name) => {
      await withNameRoute(async () => {
        const { fetch, deps } = gateway()
        const res = await forward(req(`/api/servers/${name}/test`, { method: 'POST' }), deps)
        expect(res.status).toBe(400)
        expect(fetch).not.toHaveBeenCalled()
      })
    })

    it('rejects JSON bodies over 16 KiB with 413', async () => {
      await withNameRoute(async () => {
        const { fetch, deps } = gateway()
        const res = await forward(req('/api/servers/zz-test/test', { method: 'POST', body: 'x'.repeat(16 * 1024 + 1) }), deps)
        expect(res.status).toBe(413)
        expect(fetch).not.toHaveBeenCalled()
      })
    })
  })
})

describe('managerFetch', () => {
  const conn = { managerUrl: 'http://manager.internal:3001', managerSecret: 's'.repeat(32) }

  it('adds the bearer secret and operator header to <managerUrl><path>', async () => {
    const f = vi.fn(async (..._a: unknown[]) => ok())
    await managerFetch('/servers', { method: 'GET' }, 'alice', f as never, conn)
    const [url, init] = f.mock.calls[0]! as [URL, RequestInit]
    expect(String(url)).toBe('http://manager.internal:3001/servers')
    const h = new Headers(init.headers)
    expect(h.get('authorization')).toBe(`Bearer ${conn.managerSecret}`)
    expect(h.get('x-operator')).toBe('alice')
  })
})

describe('authorize for /api/servers', () => {
  it('rejects without a session', () => {
    const { deps } = testDeps()
    expect(authorize({ path: '/api/servers', method: 'GET', host: 'app.example', origin: undefined, token: undefined }, deps))
      .toMatchObject({ ok: false, status: 401 })
  })
})
