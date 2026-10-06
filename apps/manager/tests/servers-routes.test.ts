import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { KubectlError } from '../src/kube/kubectl.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'silent' }
const items = [...fixture('deploy-list').items, ...fixture('pods-running').items]
const traefik = JSON.stringify({ spec: { valuesContent: 'ports:\n  mc-daan:\n    exposedPort: 19132\n' } })
const cluster = () => fakeKubectl([
  { match: a => a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items }) } },
  { match: a => a[1] === 'helmchartconfig', result: { stdout: traefik } },
])
const down = () => fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('unreachable') } }])
const get = (kubectl: ReturnType<typeof cluster>, url: string, authorization: string | null = `Bearer ${secret}`) =>
  buildApp(config, { kubectl }).inject({ method: 'GET', url, headers: authorization ? { authorization } : {} })

describe('server read routes', () => {
  it('GET /servers returns the list shape', async () => {
    const res = await get(cluster(), '/servers')
    expect(res.statusCode).toBe(200)
    expect(res.json().clusterOk).toBe(true)
    expect(res.json().servers).toHaveLength(5)
  })

  it('GET /servers/daan returns detail', async () => {
    const res = await get(cluster(), '/servers/daan')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ name: 'daan', port: 19132, resourceVersion: '1000' })
    expect(res.json().settings.length).toBeGreaterThan(0)
  })

  it('requires the bearer secret', async () => {
    expect((await get(cluster(), '/servers', null)).statusCode).toBe(401)
  })

  it.each(['/servers/Bad_Name', '/servers/..%2f'])('rejects %s with 400 and no kubectl call', async (url) => {
    const kubectl = cluster()
    expect((await get(kubectl, url)).statusCode).toBe(400)
    expect(kubectl.calls).toHaveLength(0)
  })

  it('404 for an unknown name', async () => {
    expect((await get(cluster(), '/servers/nope')).statusCode).toBe(404)
  })

  it('502 unavailable without stderr text when the cluster is unreachable', async () => {
    const detail = await get(down(), '/servers/daan')
    expect(detail.statusCode).toBe(502)
    expect(detail.json()).toMatchObject({ error: 'unavailable' })
    const list = await get(down(), '/servers')
    expect(list.statusCode).toBe(200)
    expect(list.json()).toMatchObject({ servers: [], clusterOk: false })
  })
})
