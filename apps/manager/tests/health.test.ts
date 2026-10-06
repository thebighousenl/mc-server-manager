import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { KubectlError } from '../src/kube/kubectl.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'silent' }
const canI = (stdout: (args: string[]) => string) =>
  fakeKubectl([{ match: a => a[0] === 'auth', result: a => ({ stdout: stdout(a) }) }])
const get = (kubectl: ReturnType<typeof canI>, authorization?: string) =>
  buildApp(config, { kubectl }).inject({ method: 'GET', url: '/health', headers: authorization ? { authorization } : {} })

describe('GET /health', () => {
  it('returns 200 with status, uptime and cluster permissions for a valid Bearer secret', async () => {
    const res = await get(canI(() => 'yes'), `Bearer ${secret}`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(body.cluster).toEqual({ reachable: true, missing: [] })
  })

  it('lists missing permissions', async () => {
    const res = await get(canI(a => (a[2] === 'delete' && a[3] === 'jobs.batch' ? 'no' : 'yes')), `Bearer ${secret}`)
    expect(res.json().cluster).toEqual({ reachable: true, missing: ['delete jobs.batch (minecraft-servers)'] })
  })

  it('stays 200 with reachable:false when the cluster fails', async () => {
    const kubectl = fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('unreachable') } }])
    const res = await get(kubectl as never, `Bearer ${secret}`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', cluster: { reachable: false, missing: [] } })
  })

  it.each([
    ['no header', undefined],
    ['wrong secret', 'Bearer nope'],
    ['same-length wrong secret', `Bearer ${'x'.repeat(32)}`],
    ['non-Bearer scheme', `Basic ${secret}`],
  ])('returns 401 for %s', async (_name, header) => {
    const k = canI(() => 'yes')
    const res = await get(k, header)
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'unauthorized' })
    expect(k.calls).toHaveLength(0)
  })
})
