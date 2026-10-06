// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { authorize } from '../server/utils/authorize'
import { forward } from '../server/utils/servers-gateway'
import { testDeps } from './helpers/auth'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })

function setup(respond: () => Response | Promise<Response> = () => json({ servers: [] })) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => respond())
  const deps = { managerUrl: 'http://manager.internal:4000', managerSecret: 's3cret', fetch }
  const call = (path: string, over: Partial<Parameters<typeof forward>[0]> = {}) =>
    forward({ method: 'GET', path, username: 'alice', ...over }, deps)
  return { fetch, call }
}

describe('forward: allow-list', () => {
  it('forwards GET /api/servers to the manager path without /api', async () => {
    const { fetch, call } = setup()
    const res = await call('/api/servers')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ servers: [] })
    expect(String(fetch.mock.calls[0]![0])).toBe('http://manager.internal:4000/servers')
  })

  it.each([
    ['POST', '/api/servers'],
    ['DELETE', '/api/servers'],
    ['GET', '/api/other'],
    ['GET', '/api/servers/foo'], // not in the table yet
    ['GET', '/api/servers/'],
    ['GET', '/api/servers/../health'],
    ['GET', '/api/servers/%2e%2e/health'],
    ['GET', '//evil.example/api/servers'],
  ])('%s %s -> 404 without calling fetch', async (method, path) => {
    const { fetch, call } = setup()
    const res = await call(path, { method })
    expect(res.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never lets the path change the target host', async () => {
    const { fetch, call } = setup()
    await call('/api/servers', { search: '?//evil.example/x' })
    expect(new URL(String(fetch.mock.calls[0]![0])).origin).toBe('http://manager.internal:4000')
  })
})

describe('forward: :name validation', () => {
  // Uses a real row shape through an injected table so this test does not depend on later PRs.
  it.each(['A', 'a', '1abc', 'has_underscore', 'x'.repeat(21), '..', '%2e%2e', 'a%2Fb', 'a b'])('rejects %j with 400', async (name) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({}))
    const res = await forward(
      { method: 'GET', path: `/api/servers/${name}/start`, username: 'alice' },
      { managerUrl: 'http://m', managerSecret: 's', fetch, routes: [{ method: 'GET', pattern: '/api/servers/:name/start' }] },
    )
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards a valid name', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({}))
    const res = await forward(
      { method: 'GET', path: '/api/servers/bedrock-1/start', username: 'alice' },
      { managerUrl: 'http://m', managerSecret: 's', fetch, routes: [{ method: 'GET', pattern: '/api/servers/:name/start' }] },
    )
    expect(res.status).toBe(200)
    expect(String(fetch.mock.calls[0]![0])).toBe('http://m/servers/bedrock-1/start')
  })
})

describe('forward: manager request', () => {
  it('adds bearer secret and operator header', async () => {
    const { fetch, call } = setup()
    await call('/api/servers')
    const headers = new Headers(fetch.mock.calls[0]![1]!.headers)
    expect(headers.get('authorization')).toBe('Bearer s3cret')
    expect(headers.get('x-operator')).toBe('alice')
  })
})

describe('forward: response', () => {
  it('strips set-cookie and non-allow-listed headers', async () => {
    const { call } = setup(() => json({}, {
      headers: { 'content-type': 'application/json', 'set-cookie': 'x=1', 'x-powered-by': 'fastify', server: 'node', 'cache-control': 'no-store' },
    }))
    const res = await call('/api/servers')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-powered-by')).toBeNull()
    expect(res.headers.get('server')).toBeNull()
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('passes 4xx through', async () => {
    const { call } = setup(() => json({ error: 'forbidden' }, { status: 403 }))
    const res = await call('/api/servers')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it.each([500, 503, 401])('manager %i -> 502 unavailable', async (status) => {
    const { call } = setup(() => json({ error: 'x', detail: 'kubectl: secret' }, { status }))
    const res = await call('/api/servers')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('network error -> 502 unavailable', async () => {
    const { call } = setup(() => {
      throw new TypeError('fetch failed')
    })
    const res = await call('/api/servers')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('streams text/event-stream through unbuffered', async () => {
    let finish!: () => void
    const done = new Promise<void>(r => (finish = r))
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(enc.encode('event: servers\ndata: []\n\n'))
        await done
        c.close()
      },
    })
    const { call } = setup(() => new Response(body, { headers: { 'content-type': 'text/event-stream' } }))
    const res = await call('/api/servers')
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const first = await res.body!.getReader().read() // resolves while upstream is still open
    expect(new TextDecoder().decode(first.value)).toContain('event: servers')
    finish()
  })
})

describe('forward: request body', () => {
  const routes = [{ method: 'POST', pattern: '/api/servers/:name/command' }]
  const run = (body: string) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({}))
    return forward(
      { method: 'POST', path: '/api/servers/foo/command', username: 'alice', body },
      { managerUrl: 'http://m', managerSecret: 's', fetch, routes },
    ).then(res => ({ res, fetch }))
  }

  it('forwards a JSON body up to 16 KiB', async () => {
    const { res, fetch } = await run('x'.repeat(16 * 1024))
    expect(res.status).toBe(200)
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('content-type')).toBe('application/json')
  })

  it('rejects larger bodies with 413 without calling fetch', async () => {
    const { res, fetch } = await run('x'.repeat(16 * 1024 + 1))
    expect(res.status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('authorize for /api/servers', () => {
  it.each(['/api/servers', '/api/servers/foo/start', '/api/servers/events'])('%s without a session -> 401', (path) => {
    const { deps } = testDeps()
    const res = authorize({ path, method: 'GET', host: 'app.example' }, deps)
    expect(res).toMatchObject({ ok: false, status: 401 })
  })
})
