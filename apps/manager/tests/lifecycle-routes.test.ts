import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const lines: string[] = []
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'info', logStream: { write: (m: string) => { lines.push(m) } } }
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
const kubectl = (replicas: number) => fakeKubectl([
  {
    match: a => a[0] === 'get' && a[1] === 'deploy,pods',
    result: { stdout: JSON.stringify({ items: [{ kind: 'Deployment', metadata: { name: 'bedrock-zz', labels }, spec: { replicas, template: { spec: { containers: [{ env: [{ name: 'VERSION', value: 'LATEST' }] }] } } } }] }) },
  },
  { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
  { match: a => a[0] === 'get' && a[1] === 'pods', result: { stdout: '{"items":[]}' } },
  { match: a => ['scale', 'rollout'].includes(a[0]!), result: { stdout: '' } },
])
const post = (k: ReturnType<typeof kubectl>, url: string, payload?: unknown) =>
  buildApp(config, { kubectl: k }).inject({
    method: 'POST', url, payload: payload as object, headers: { authorization: `Bearer ${secret}`, 'x-operator': 'alice' },
  })
const writes = (k: ReturnType<typeof kubectl>) => k.calls.filter(a => ['scale', 'rollout'].includes(a[0]!))

describe('lifecycle routes', () => {
  it('start returns warnings and logs the operator', async () => {
    lines.length = 0
    const k = kubectl(0)
    const res = await post(k, '/servers/zz/start')
    expect(res.statusCode).toBe(200)
    expect(res.json().warnings).toHaveLength(1)
    expect(writes(k)).toEqual([['scale', 'deploy/bedrock-zz', '--replicas=1']])
    expect(lines.some(l => l.includes('"action":"start"') && l.includes('"operator":"alice"'))).toBe(true)
  })

  it('start on a running server is 409', async () => {
    expect((await post(kubectl(1), '/servers/zz/start')).statusCode).toBe(409)
  })

  it('stop and restart succeed with confirm:true', async () => {
    const k = kubectl(1)
    expect((await post(k, '/servers/zz/stop', { confirm: true })).statusCode).toBe(200)
    expect((await post(k, '/servers/zz/restart', { confirm: true })).statusCode).toBe(200)
    expect(writes(k)).toHaveLength(2)
  })

  it.each(['stop', 'restart'])('%s without confirm is 400 and makes no call', async (action) => {
    for (const body of [undefined, {}, { confirm: false }, { confirm: 'true' }]) {
      const k = kubectl(1)
      expect((await post(k, `/servers/zz/${action}`, body)).statusCode).toBe(400)
      expect(k.calls).toHaveLength(0)
    }
  })

  it('rejects unknown fields such as force', async () => {
    const k = kubectl(1)
    expect((await post(k, '/servers/zz/stop', { confirm: true, force: true })).statusCode).toBe(400)
    expect((await post(k, '/servers/zz/start', { force: true })).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
  })

  it('400 for an invalid name, 404 for an unknown one', async () => {
    const k = kubectl(1)
    expect((await post(k, '/servers/Bad_Name/start')).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
    expect((await post(k, '/servers/other/start')).statusCode).toBe(404)
  })
})
