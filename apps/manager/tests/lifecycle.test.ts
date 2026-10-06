import { describe, expect, it } from 'vitest'
import { restartServer, startServer, stopServer } from '../src/servers/lifecycle.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const traefik = JSON.stringify({ spec: { valuesContent: 'ports:\n  mc-zz:\n    exposedPort: 19140\n' } })

// Fake cluster: `scale` changes replicas; pods linger for `lingerPolls` pod queries after a scale down.
function cluster(o: { replicas?: number, managed?: boolean, name?: string, version?: string | null, lingerPolls?: number } = {}) {
  const name = o.name ?? 'zz'
  const s = { replicas: o.replicas ?? 1, linger: 0 }
  const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': name, ...(o.managed === false ? {} : { 'mc-manager/managed': 'true', 'mc-manager/server': name }) }
  const env = o.version === null ? [] : [{ name: 'VERSION', value: o.version ?? 'LATEST' }]
  const kubectl = fakeKubectl([
    {
      match: a => a[0] === 'get' && a[1] === 'deploy,pods',
      result: () => ({
        stdout: JSON.stringify({
          items: [{
            kind: 'Deployment',
            metadata: { name: `bedrock-${name}`, labels, resourceVersion: '1', creationTimestamp: '2026-01-01T00:00:00Z' },
            spec: { replicas: s.replicas, template: { spec: { containers: [{ env }] } } },
          }],
        }),
      }),
    },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: traefik } },
    {
      match: a => a[0] === 'get' && a[1] === 'pods',
      result: () => ({ stdout: JSON.stringify({ items: s.linger-- > 0 ? [{ kind: 'Pod', metadata: { name: 'p' } }] : [] }) }),
    },
    {
      match: a => a[0] === 'scale',
      result: (a) => {
        s.replicas = Number(a.find(x => x.startsWith('--replicas='))!.split('=')[1])
        s.linger = s.replicas === 0 ? (o.lingerPolls ?? 2) : 0
        return { stdout: '' }
      },
    },
    { match: a => a[0] === 'rollout', result: { stdout: '' } },
  ])
  return kubectl
}
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }
const deps = (kubectl: ReturnType<typeof cluster>) => ({ kubectl, logger, timeoutMs: 200, pollMs: 1 })
const o = { operator: 'alice' }
const verbs = (k: ReturnType<typeof cluster>) => k.calls.filter(a => ['scale', 'rollout'].includes(a[0]!))

describe('stopServer', () => {
  it('requires confirm:true', async () => {
    const k = cluster()
    await expect(stopServer(deps(k), 'zz', { ...o, confirm: false })).rejects.toMatchObject({ status: 400 })
    expect(k.calls).toHaveLength(0)
  })

  it('scales to 0 then waits until no pod matches the selector', async () => {
    logs.length = 0
    const k = cluster({ lingerPolls: 2 })
    const res = await stopServer(deps(k), 'zz', { ...o, confirm: true })
    expect(res.warnings).toEqual([])
    expect(verbs(k)).toEqual([['scale', 'deploy/bedrock-zz', '--replicas=0']])
    const podCalls = k.calls.filter(a => a[0] === 'get' && a[1] === 'pods')
    expect(podCalls).toHaveLength(3)
    expect(podCalls[0]).toEqual(['get', 'pods', '-l', 'app.kubernetes.io/instance=zz,app.kubernetes.io/name=bedrock', '-o', 'json'])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ operator: 'alice', server: 'zz', action: 'stop', outcome: 'ok' })
  })

  it('times out with an error naming the server and logs failed', async () => {
    logs.length = 0
    const k = cluster({ lingerPolls: 1e9 })
    await expect(stopServer(deps(k), 'zz', { ...o, confirm: true })).rejects.toThrow(/zz/)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: 'stop', outcome: 'failed' })
  })

  it('works on a protected server', async () => {
    const k = cluster({ name: 'daan' })
    await expect(stopServer(deps(k), 'daan', { ...o, confirm: true })).resolves.toBeTruthy()
  })

  it('has no forced-kill path: a force field is rejected', async () => {
    const k = cluster()
    await expect(stopServer(deps(k), 'zz', { ...o, confirm: true, force: true } as never)).rejects.toMatchObject({ status: 400 })
    expect(verbs(k)).toEqual([])
  })

  it('refuses an unmanaged server with a message to adopt first', async () => {
    const k = cluster({ managed: false })
    await expect(stopServer(deps(k), 'zz', { ...o, confirm: true })).rejects.toThrow(/adopt/)
    expect(verbs(k)).toEqual([])
  })

  it('404 for an unknown server', async () => {
    await expect(stopServer(deps(cluster()), 'other', { ...o, confirm: true })).rejects.toMatchObject({ status: 404 })
  })
})

describe('startServer', () => {
  it('scales to 1 and warns about the latest version', async () => {
    logs.length = 0
    const k = cluster({ replicas: 0 })
    const res = await startServer(deps(k), 'zz', o)
    expect(verbs(k)).toEqual([['scale', 'deploy/bedrock-zz', '--replicas=1']])
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toMatch(/latest/i)
    expect(logs[0]).toMatchObject({ action: 'start', outcome: 'ok' })
  })

  it('warns when VERSION is unset, not when pinned', async () => {
    expect((await startServer(deps(cluster({ replicas: 0, version: null })), 'zz', o)).warnings).toHaveLength(1)
    expect((await startServer(deps(cluster({ replicas: 0, version: '1.21.50.07' })), 'zz', o)).warnings).toEqual([])
  })

  it('409 when the server is already running', async () => {
    const k = cluster({ replicas: 1 })
    await expect(startServer(deps(k), 'zz', o)).rejects.toMatchObject({ status: 409 })
    expect(verbs(k)).toEqual([])
  })

  it('refuses an unmanaged server', async () => {
    await expect(startServer(deps(cluster({ managed: false, replicas: 0 })), 'zz', o)).rejects.toThrow(/adopt/)
  })

  it('takes the per-server lock', async () => {
    const k = cluster({ replicas: 0 })
    const res = await Promise.allSettled([startServer(deps(k), 'zz', o), startServer(deps(k), 'zz', o)])
    expect(res.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(verbs(k)).toHaveLength(1)
  })
})

describe('restartServer', () => {
  it('requires confirm and runs rollout restart with the warning', async () => {
    const k = cluster()
    await expect(restartServer(deps(k), 'zz', { ...o, confirm: false })).rejects.toMatchObject({ status: 400 })
    logs.length = 0
    const res = await restartServer(deps(k), 'zz', { ...o, confirm: true })
    expect(verbs(k)).toEqual([['rollout', 'restart', 'deploy/bedrock-zz']])
    expect(res.warnings).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: 'restart', outcome: 'ok' })
  })
})
