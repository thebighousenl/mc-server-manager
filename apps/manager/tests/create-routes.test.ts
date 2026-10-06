import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const lines: string[] = []
const config = { ...loadConfig({ MANAGER_SECRET: secret, MC_PUBLIC_HOST: 'node.example' }), logLevel: 'info', logStream: { write: (m: string) => { lines.push(m) } } }
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'daan', 'mc-manager/managed': 'true', 'mc-manager/server': 'daan' }
const deployment = { kind: 'Deployment', metadata: { name: 'bedrock-daan', labels }, spec: { replicas: 0, template: { spec: { containers: [{ name: 'bedrock', env: [] }] } } } }
const kubectl = (existing = false) => fakeKubectl([
  { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items: existing ? [deployment] : [] }) } },
  { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: JSON.stringify(fixture('helmchartconfig-traefik')) } },
  { match: () => true, result: { stdout: '' } },
])
const pings: [string, number][] = []
const call = (k: ReturnType<typeof kubectl>, method: 'POST', url: string, payload?: unknown, ping = async (h: string, p: number) => { pings.push([h, p]); return true }) =>
  buildApp(config, { kubectl: k, ping }).inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${secret}`, 'x-operator': 'alice' } })
const body = { name: 'zz', settings: { LEVEL_NAME: 'zz' }, confirm: true }

describe('POST /servers', () => {
  it('creates the server and returns the firewall hint', async () => {
    lines.length = 0
    const res = await call(kubectl(), 'POST', '/servers', body)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ server: 'zz', firewall: { port: 19133, protocol: 'udp' } })
    expect(lines.some(l => l.includes('"action":"create"') && l.includes('"operator":"alice"'))).toBe(true)
  })

  it.each([
    [{ ...body, confirm: false }, 400], [{ ...body, extra: 1 }, 400], [{ ...body, name: 'Bad' }, 400],
    [{ ...body, port: 19134 }, 400], [{ ...body, name: 'daan' }, 403], [undefined, 400],
  ])('rejects %j with %i and no write', async (payload, status) => {
    const k = kubectl()
    expect((await call(k, 'POST', '/servers', payload)).statusCode).toBe(status)
    expect(k.calls.some(a => ['create', 'apply', 'replace', 'delete'].includes(a[0]!))).toBe(false)
  })

  it('403 for a protected name that exists; other names still create', async () => {
    expect((await call(kubectl(true), 'POST', '/servers', { ...body, name: 'daan' })).statusCode).toBe(403)
    expect((await call(kubectl(true), 'POST', '/servers', { ...body, name: 'ab' })).statusCode).toBe(200)
  })
})

describe('POST /servers/:name/reachability', () => {
  it('pings the configured public host on the server port, never a client supplied one', async () => {
    pings.length = 0
    const res = await call(kubectl(true), 'POST', '/servers/daan/reachability', { host: 'evil.example' })
    expect(res.json()).toEqual({ reachable: true })
    expect(pings).toEqual([['node.example', 19134]])
  })

  it('reports unreachable', async () => {
    expect((await call(kubectl(true), 'POST', '/servers/daan/reachability', undefined, async () => false)).json()).toEqual({ reachable: false })
  })

  it('404 for unknown and 400 for invalid names without pinging', async () => {
    pings.length = 0
    expect((await call(kubectl(), 'POST', '/servers/nope/reachability')).statusCode).toBe(404)
    expect((await call(kubectl(), 'POST', '/servers/Bad_Name/reachability')).statusCode).toBe(400)
    expect(pings).toHaveLength(0)
  })
})
