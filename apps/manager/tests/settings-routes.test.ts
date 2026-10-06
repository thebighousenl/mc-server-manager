import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { KubectlError } from '../src/kube/kubectl.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const lines: string[] = []
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'info', logStream: { write: (m: string) => { lines.push(m) } } }
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
const deployment = { kind: 'Deployment', metadata: { name: 'bedrock-zz', labels, resourceVersion: '5' }, spec: { replicas: 0, template: { spec: { containers: [{ name: 'bedrock', env: [{ name: 'VERSION', value: 'LATEST' }] }] } } } }
const kubectl = (conflict = false) => fakeKubectl([
  { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items: [deployment] }) } },
  { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
  { match: a => a[0] === 'get', result: { stdout: JSON.stringify(deployment) } },
  { match: a => a[0] === 'patch', result: () => { if (conflict) throw new KubectlError('conflict'); return { stdout: '' } } },
])
const put = (k: ReturnType<typeof kubectl>, url: string, payload?: unknown) =>
  buildApp(config, { kubectl: k }).inject({ method: 'PUT', url, payload: payload as object, headers: { authorization: `Bearer ${secret}`, 'x-operator': 'alice' } })
const body = { settings: { MAX_PLAYERS: '20' }, resourceVersion: '5', confirm: true }

describe('PUT /servers/:name/settings', () => {
  it('applies the patch, returns warnings and logs the operator', async () => {
    lines.length = 0
    const k = kubectl()
    const res = await put(k, '/servers/zz/settings', body)
    expect(res.statusCode).toBe(200)
    expect(res.json().warnings).toHaveLength(1)
    expect(k.calls.filter(a => a[0] === 'patch')).toHaveLength(1)
    expect(lines.some(l => l.includes('"action":"settings"') && l.includes('"operator":"alice"'))).toBe(true)
  })

  it('409 stale on a conflict', async () => {
    const res = await put(kubectl(true), '/servers/zz/settings', body)
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('stale')
  })

  it.each([
    [{ ...body, confirm: false }],
    [{ ...body, settings: { EULA: 'FALSE' } }],
    [{ ...body, resourceVersion: undefined }],
    [{ ...body, extra: 1 }],
    [undefined],
  ])('400 for body %j without writing', async (payload) => {
    const k = kubectl()
    expect((await put(k, '/servers/zz/settings', payload)).statusCode).toBe(400)
    expect(k.calls.some(a => a[0] === 'patch')).toBe(false)
  })

  it('400 for an invalid name without kubectl, 404 for an unknown one', async () => {
    const k = kubectl()
    expect((await put(k, '/servers/Bad_Name/settings', body)).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
    expect((await put(k, '/servers/other/settings', body)).statusCode).toBe(404)
  })
})
