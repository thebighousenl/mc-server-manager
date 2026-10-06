import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const lines: string[] = []
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'info', logStream: { write: (m: string) => { lines.push(m) } } }
const KINDS = ['Deployment', 'Service', 'IngressRouteUDP', 'PersistentVolumeClaim']
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz' }
const kubectl = () => fakeKubectl([
  {
    match: a => a[0] === 'get',
    result: { stdout: JSON.stringify({ items: [...KINDS.map(kind => ({ kind, metadata: { name: `bedrock-zz`, generation: 1, labels } })), { kind: 'Pod', metadata: { name: 'p', uid: 'u', labels } }] }) },
  },
  { match: a => a[0] === 'label', result: { stdout: '' } },
])
const post = (k: ReturnType<typeof kubectl>, url: string, payload: unknown) =>
  buildApp(config, { kubectl: k }).inject({
    method: 'POST', url, payload: payload as object, headers: { authorization: `Bearer ${secret}`, 'x-operator': 'alice' },
  })

describe('POST /servers/:name/adopt', () => {
  it('confirm:false returns the plan and makes no write call', async () => {
    const k = kubectl()
    const res = await post(k, '/servers/zz/adopt', { confirm: false })
    expect(res.statusCode).toBe(200)
    expect(res.json().changes).toHaveLength(4)
    expect(k.calls.some(a => a[0] === 'label')).toBe(false)
  })

  it('confirm:true applies and logs the operator', async () => {
    lines.length = 0
    const k = kubectl()
    const res = await post(k, '/servers/zz/adopt', { confirm: true })
    expect(res.statusCode).toBe(200)
    expect(res.json().changed).toBe(true)
    expect(k.calls.filter(a => a[0] === 'label')).toHaveLength(4)
    expect(lines.some(l => l.includes('"action":"adopt"') && l.includes('"operator":"alice"'))).toBe(true)
  })

  it.each([{}, { confirm: 'yes' }, undefined])('rejects body %j with 400', async (body) => {
    const k = kubectl()
    expect((await post(k, '/servers/zz/adopt', body)).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
  })

  it('400 for an invalid name without kubectl', async () => {
    const k = kubectl()
    expect((await post(k, '/servers/Bad_Name/adopt', { confirm: true })).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
  })

  it('404 for a server without bedrock objects', async () => {
    const k = fakeKubectl([{ match: () => true, result: { stdout: '{"items":[]}' } }])
    expect((await post(k as never, '/servers/zz/adopt', { confirm: false })).statusCode).toBe(404)
  })
})
