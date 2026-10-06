import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'silent' }
const auth = { authorization: `Bearer ${secret}` }
const deployment = { kind: 'Deployment', metadata: { name: 'bedrock-zz', labels: { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz' } }, spec: { template: { spec: { containers: [{}] } } } }

// A kubectl whose `logs -f` child never ends by itself.
function setup() {
  const base = fakeKubectl([
    { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items: [deployment] }) } },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
    { match: a => a[0] === 'logs', result: { stdout: 'line one\nline two\n' } },
  ])
  const spawned: { args: string[], stdout: PassThrough, killed: boolean }[] = []
  const kubectl = Object.assign(base, {
    spawn(args: string[]) {
      const rec = { args, stdout: new PassThrough(), killed: false }
      spawned.push(rec)
      return Object.assign(new EventEmitter(), {
        stdout: rec.stdout,
        kill() {
          rec.killed = true
          return true
        },
      }) as never
    },
  })
  return { kubectl, spawned }
}
let app: ReturnType<typeof buildApp> | undefined
afterEach(async () => { await app?.close() })

describe('GET /servers/:name/logs', () => {
  it('returns the last lines as text', async () => {
    const { kubectl } = setup()
    app = buildApp(config, { kubectl })
    const res = await app.inject({ method: 'GET', url: '/servers/zz/logs?tail=200', headers: auth })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body).toBe('line one\nline two\n')
    expect(kubectl.calls).toContainEqual(['logs', 'deploy/bedrock-zz', '--tail=200'])
  })

  it('caps tail at 1000', async () => {
    const { kubectl } = setup()
    app = buildApp(config, { kubectl })
    await app.inject({ method: 'GET', url: '/servers/zz/logs?tail=999999', headers: auth })
    expect(kubectl.calls).toContainEqual(['logs', 'deploy/bedrock-zz', '--tail=1000'])
  })

  it('refuses an unknown name without spawning', async () => {
    const { kubectl, spawned } = setup()
    app = buildApp(config, { kubectl })
    expect((await app.inject({ method: 'GET', url: '/servers/nope/logs?follow=1', headers: auth })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/servers/Bad_Name/logs?follow=1', headers: auth })).statusCode).toBe(400)
    expect(spawned).toHaveLength(0)
  })

  it('follow=1 streams SSE lines from kubectl logs -f and kills the child on client abort', async () => {
    const { kubectl, spawned } = setup()
    app = buildApp(config, { kubectl })
    const base = await app.listen({ port: 0, host: '127.0.0.1' })
    const abort = new AbortController()
    const res = await fetch(`${base}/servers/zz/logs?follow=1&tail=5000`, { headers: auth, signal: abort.signal })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(spawned[0]!.args).toEqual(['logs', '-f', 'deploy/bedrock-zz', '--tail=1000'])
    spawned[0]!.stdout.write('hello\nwor')
    spawned[0]!.stdout.write('ld\n')
    const reader = res.body!.getReader()
    let text = ''
    while (!text.includes('world')) text += new TextDecoder().decode((await reader.read()).value)
    expect(text).toBe('data: hello\n\ndata: world\n\n')
    abort.abort()
    await expect.poll(() => spawned[0]!.killed).toBe(true)
  })
})
