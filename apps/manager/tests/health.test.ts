import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { KubectlError } from '../src/kube/kubectl.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'silent' }
const allowing = (denied?: string) =>
  fakeKubectl([{ match: (a) => a[0] === 'auth', result: (a) => ({ stdout: denied && a.includes(denied) ? 'no' : 'yes', code: 0 }) }])
const down = () =>
  fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('unreachable') } }])

const get = (app: ReturnType<typeof buildApp>, authorization?: string) =>
  app.inject({ method: 'GET', url: '/health', headers: authorization ? { authorization } : {} })

describe('GET /health', () => {
  it('returns 200 with status, uptime and cluster state for a valid Bearer secret', async () => {
    const res = await get(buildApp(config, { kubectl: allowing() }), `Bearer ${secret}`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(body.cluster).toEqual({ reachable: true, missing: [] })
  })

  it('lists missing permissions while staying 200', async () => {
    const res = await get(buildApp(config, { kubectl: allowing('services') }), `Bearer ${secret}`)
    expect(res.statusCode).toBe(200)
    expect(res.json().cluster.reachable).toBe(true)
    expect(res.json().cluster.missing).toContain('get services (minecraft-servers)')
  })

  it('stays 200 with reachable:false when the cluster is down', async () => {
    const res = await get(buildApp(config, { kubectl: down() }), `Bearer ${secret}`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', cluster: { reachable: false, missing: [] } })
  })

  it.each([
    ['no header', undefined],
    ['wrong secret', 'Bearer nope'],
    ['same-length wrong secret', `Bearer ${'x'.repeat(32)}`],
    ['non-Bearer scheme', `Basic ${secret}`],
  ])('returns 401 for %s without touching the cluster', async (_name, header) => {
    const kubectl = allowing()
    const res = await get(buildApp(config, { kubectl }), header)
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'unauthorized' })
    expect(kubectl.calls).toHaveLength(0)
  })
})
