import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { PROTECTED_NAMES } from '../src/servers/protect.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const lines: string[] = []
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'info', logStream: { write: (m: string) => { lines.push(m) } } }
const WRITE_VERBS = ['create', 'apply', 'replace', 'delete', 'patch', 'scale', 'label']
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz' }
const kubectl = () => fakeKubectl([
  { match: a => a[0] === 'get' && a[1] === 'deploy,svc,ingressrouteudp,pvc', result: a => ({ stdout: JSON.stringify({ items: a.join(' ').includes('instance=zz') ? [{ kind: 'Service', metadata: { name: 'bedrock-zz', labels } }] : [] }) }) },
  { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
  { match: () => true, result: { stdout: '' } },
])
const del = (k: ReturnType<typeof kubectl>, url: string, body?: string, contentType = 'application/json') =>
  buildApp(config, { kubectl: k }).inject({ method: 'DELETE', url, payload: body, headers: { authorization: `Bearer ${secret}`, 'x-operator': 'alice', ...(body === undefined ? {} : { 'content-type': contentType }) } })
const writes = (k: ReturnType<typeof kubectl>) => k.calls.filter(a => WRITE_VERBS.includes(a[0]!))

describe('DELETE /servers/:name', () => {
  it.each(PROTECTED_NAMES)('403 for %s regardless of body, with zero kubectl calls', async (name) => {
    lines.length = 0
    for (const body of [JSON.stringify({ confirmName: name }), JSON.stringify({ confirmName: 'x', exportWorld: false }), '{bad json', '[]', undefined]) {
      const k = kubectl()
      const res = await del(k, `/servers/${name}`, body)
      expect(res.statusCode).toBe(403)
      expect(k.calls).toHaveLength(0)
    }
    expect(lines.filter(l => l.includes('"action":"delete"') && l.includes('"operator":"alice"')).length).toBeGreaterThan(0)
  })

  it.each([undefined, '{bad', '[]', '"zz"', '{}', '{"confirmName":"zz","exportWorld":false}', '{"confirmName":"zz","x":1}', '{"confirmName":5}', '{"confirmName":"ZZ"}'])('400 for body %s with zero writes', async (body) => {
    const k = kubectl()
    expect((await del(k, '/servers/zz', body)).statusCode).toBe(400)
    expect(writes(k)).toHaveLength(0)
  })

  it('400 for an invalid name without calling kubectl', async () => {
    const k = kubectl()
    expect((await del(k, '/servers/Bad_Name', '{"confirmName":"x"}')).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
  })

  it('409 for an unmanaged server', async () => {
    const res = await del(kubectl(), '/servers/zz', '{"confirmName":"zz"}')
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('adopt it first')
  })

  it('404 for an unknown server', async () => {
    expect((await del(kubectl(), '/servers/nope', '{"confirmName":"nope"}')).statusCode).toBe(404)
  })
})
