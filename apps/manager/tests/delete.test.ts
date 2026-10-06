import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { KubectlError } from '../src/kube/kubectl.js'
import { nextFreePort, type TraefikValues } from '../src/kube/traefik.js'
import { deleteServer } from '../src/servers/delete.js'
import { listServers } from '../src/servers/list.js'
import { PROTECTED_NAMES } from '../src/servers/protect.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const WRITE_VERBS = ['create', 'apply', 'replace', 'delete', 'patch', 'scale', 'label', 'annotate']
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }
const mgr = { 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
const KINDS = [['ingressrouteudp', 'IngressRouteUDP', 'bedrock-zz'], ['service', 'Service', 'bedrock-zz'], ['deployment', 'Deployment', 'bedrock-zz'], ['pvc', 'PersistentVolumeClaim', 'bedrock-data-zz']] as const

// A small stateful cluster: deletes remove objects, scale stops the pod, replace updates the Traefik config.
function cluster(o: { name?: string, labels?: Record<string, string>, exportFails?: boolean, failDelete?: string, absentTraefik?: boolean } = {}) {
  const name = o.name ?? 'zz'
  const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': name, ...(o.labels ?? mgr) }
  const present = new Set<string>(KINDS.map(([r]) => `${r}/${r === 'pvc' ? `bedrock-data-${name}` : `bedrock-${name}`}`))
  let replicas = 1
  let failOnce = o.failDelete
  const traefik = fixture('helmchartconfig-traefik')
  const values = parse(traefik.spec.valuesContent) as TraefikValues
  if (!o.absentTraefik) values.ports[`mc-${name}`] = { port: 19133, exposedPort: 19133, protocol: 'UDP', expose: { default: true } }
  traefik.spec.valuesContent = stringify(values)
  const item = (r: string, kind: string, n: string) => ({ kind, metadata: { name: n, labels } })
  const deployment = () => ({ kind: 'Deployment', metadata: { name: `bedrock-${name}`, labels, resourceVersion: '1' }, spec: { replicas, template: { spec: { containers: [{ name: 'bedrock', env: [{ name: 'LEVEL_NAME', value: 'My World' }] }] } } } })
  const pod = { kind: 'Pod', metadata: { name: 'p', uid: 'u-delete', labels }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }
  const k = fakeKubectl([
    { match: a => a[0] === 'get' && a[1] === 'deploy,svc,ingressrouteudp,pvc', result: a => ({ stdout: JSON.stringify({ items: !a.join(' ').includes(`instance=${name}`) ? [] : KINDS.filter(([r, , n]) => present.has(`${r}/${n}`)).map(([r, kind, n]) => r === 'deployment' ? deployment() : item(r, kind, n)) }) }) },
    { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: () => ({ stdout: JSON.stringify({ items: present.has(`deployment/bedrock-${name}`) ? [deployment(), ...(replicas ? [pod] : [])] : [] }) }) },
    { match: a => a[0] === 'get' && a[1] === 'pods', result: () => ({ stdout: JSON.stringify({ items: replicas ? [pod] : [] }) }) },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: () => ({ stdout: JSON.stringify(traefik) }) },
    { match: a => a[0] === 'logs', result: { stdout: 'Server started.' } },
    { match: a => a[0] === 'get' && /^(pvc|deploy)\/mc-exports$/.test(a[1]!), result: { stdout: 'x\n' } },
    { match: a => a[0] === 'get' && a[1]!.startsWith('job/'), result: { stdout: JSON.stringify({ status: o.exportFails ? { failed: 1 } : { succeeded: 1 } }) } },
    { match: a => a[0] === 'scale', result: () => { replicas = 0; return { stdout: '' } } },
    { match: a => a[0] === 'apply', result: { stdout: '' } },
    { match: a => a[0] === 'replace', result: () => { Object.assign(traefik, JSON.parse(k.stdins.at(-1)!)); return { stdout: '' } } },
    { match: a => a[0] === 'create', result: { stdout: '' } },
    {
      match: a => a[0] === 'delete',
      result: (a) => {
        if (a[1] === failOnce) { failOnce = undefined; throw new KubectlError('failed') }
        present.delete(a[1]!)
        return { stdout: '' }
      },
    },
  ])
  return Object.assign(k, { present, traefikPorts: () => (parse(traefik.spec.valuesContent) as TraefikValues) })
}
type K = ReturnType<typeof cluster>
const deps = (k: K) => ({ kubectl: k, logger, exports: { size: '20Gi', storageClass: 'local-path' }, timeoutMs: 100, pollMs: 1, stopTimeoutMs: 100 })
const run = (k: K, name = 'zz', o: Record<string, unknown> = { confirmName: name }) => deleteServer(deps(k), name, { operator: 'alice', ...o } as never)
const writes = (k: K) => k.calls.filter(a => WRITE_VERBS.includes(a[0]!))
const deletes = (k: K) => k.calls.filter(a => a[0] === 'delete').map(a => a[1])

describe('deleteServer protection', () => {
  const variants = [
    { protectedLabel: true, managed: true }, { protectedLabel: true, managed: false },
    { protectedLabel: false, managed: true }, { protectedLabel: false, managed: false },
  ]
  for (const name of PROTECTED_NAMES) {
    it.each(variants)(`${name} is refused with 403 and zero write calls (%j)`, async ({ protectedLabel, managed }) => {
      const k = cluster({ name, labels: { ...(managed ? { 'mc-manager/managed': 'true', 'mc-manager/server': name } : {}), ...(protectedLabel ? { 'mc-manager/protected': 'true' } : {}) } })
      await expect(run(k, name)).rejects.toMatchObject({ status: 403 })
      await expect(run(k, name, { confirmName: 'wrong', exportWorld: false })).rejects.toMatchObject({ status: 403 })
      expect(writes(k)).toHaveLength(0)
    })
  }

  it('a non-listed server carrying the protected label is refused too, with zero writes', async () => {
    const k = cluster({ labels: { ...mgr, 'mc-manager/protected': 'true' } })
    await expect(run(k)).rejects.toMatchObject({ status: 403 })
    expect(writes(k)).toHaveLength(0)
  })

  it('refuses an unmanaged, unprotected server with 409 "adopt it first" and zero writes', async () => {
    const k = cluster({ labels: {} })
    await expect(run(k)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('adopt it first') })
    expect(writes(k)).toHaveLength(0)
  })

  it.each(['ZZ', ' zz', 'zz ', '', 'z', undefined, 5])('confirmName %j must equal the name exactly: 400 and zero writes', async (confirmName) => {
    const k = cluster()
    await expect(run(k, 'zz', { confirmName })).rejects.toMatchObject({ status: 400 })
    expect(writes(k)).toHaveLength(0)
  })

  it('rejects any other body field (exportWorld) as unknown, with zero writes', async () => {
    const k = cluster()
    await expect(run(k, 'zz', { confirmName: 'zz', exportWorld: false })).rejects.toMatchObject({ status: 400 })
    await expect(run(k, 'zz', { confirmName: 'zz', exportWorld: true })).rejects.toMatchObject({ status: 400 })
    expect(writes(k)).toHaveLength(0)
  })

  it('404 for an unknown or invalid name without writes', async () => {
    const k = cluster()
    await expect(run(k, 'nope')).rejects.toMatchObject({ status: 404 })
    await expect(run(k, 'Bad_Name')).rejects.toMatchObject({ status: 400 })
    expect(writes(k).filter(a => a[0] !== 'delete' || !a[1]!.startsWith('job/'))).toHaveLength(0)
  })

  it('writes one action log record per attempt, refusals included', async () => {
    logs.length = 0
    const k = cluster()
    await run(k, 'daan').catch(() => {})
    await run(k, 'zz', { confirmName: 'x' }).catch(() => {})
    await run(k)
    expect(logs.filter((l: any) => l.action === 'delete').map((l: any) => l.outcome)).toEqual(['refused', 'refused', 'ok']) // eslint-disable-line @typescript-eslint/no-explicit-any
  })
})

describe('deleteServer order and recovery', () => {
  it('stops, exports, then deletes Traefik entry, IngressRouteUDP, Service, Deployment, PVC last', async () => {
    const k = cluster()
    await run(k)
    const verbs = k.calls.map(a => a[0])
    const firstDelete = k.calls.findIndex(a => a[0] === 'delete' && !a[1]!.startsWith('job/'))
    expect(k.calls.findIndex(a => a[0] === 'scale')).toBeLessThan(k.calls.findIndex((a, i) => a[0] === 'create' && JSON.parse(k.stdins[i]!).kind === 'Job'))
    expect(k.calls.findIndex((a, i) => a[0] === 'create' && JSON.parse(k.stdins[i]!).kind === 'Job')).toBeLessThan(verbs.indexOf('replace'))
    expect(verbs.indexOf('replace')).toBeLessThan(firstDelete)
    expect(deletes(k).filter(d => !d!.startsWith('job/'))).toEqual(['ingressrouteudp/bedrock-zz', 'service/bedrock-zz', 'deployment/bedrock-zz', 'pvc/bedrock-data-zz'])
    expect(Object.keys(k.traefikPorts().ports)).not.toContain('mc-zz')
    expect(Object.keys(k.traefikPorts().ports)).toHaveLength(5)
  })

  it('exports the server level, always', async () => {
    const k = cluster()
    await run(k)
    const job = k.calls.flatMap((a, i) => a[0] === 'create' ? [JSON.parse(k.stdins[i]!)] : []).find(o => o.kind === 'Job')
    expect(job.spec.template.spec.containers[0].command.at(-1)).toBe('My World')
  })

  it('a failed export returns an error and the fake shows no delete call at all', async () => {
    const k = cluster({ exportFails: true })
    await expect(run(k)).rejects.toMatchObject({ status: 409 })
    expect(k.calls.some(a => a[0] === 'delete')).toBe(false)
    expect(k.calls.some(a => a[0] === 'replace')).toBe(false)
    expect(k.present.size).toBe(4)
  })

  it('a partial delete is finished by a fresh instance with no memory, and the server stays listed meanwhile', async () => {
    const k = cluster({ failDelete: 'service/bedrock-zz' })
    await expect(run(k)).rejects.toBeInstanceOf(KubectlError)
    expect([...k.present].sort()).toEqual(['deployment/bedrock-zz', 'pvc/bedrock-data-zz', 'service/bedrock-zz'])
    expect((await listServers(k)).servers.map(s => s.name)).toContain('zz')
    await run(k)
    expect(k.present.size).toBe(0)
    expect(k.calls.filter(a => a[0] === 'replace')).toHaveLength(1) // the entry was already gone
  })

  it('finishes when only the PVC is left, without stopping or exporting again', async () => {
    const k = cluster({ failDelete: 'pvc/bedrock-data-zz' })
    await expect(run(k)).rejects.toBeInstanceOf(KubectlError)
    k.calls.length = 0
    await run(k)
    expect(deletes(k)).toEqual(['pvc/bedrock-data-zz'])
    expect(k.calls.some(a => a[0] === 'scale' || a[0] === 'create')).toBe(false)
  })

  it('works when the Traefik entry is already gone', async () => {
    const k = cluster({ absentTraefik: true })
    await run(k)
    expect(k.calls.some(a => a[0] === 'replace')).toBe(false)
    expect(k.present.size).toBe(0)
  })

  it('frees the port', async () => {
    const k = cluster()
    expect(() => nextFreePort(k.traefikPorts(), 19133, 19133)).toThrow()
    await run(k)
    expect(nextFreePort(k.traefikPorts(), 19132, 19999)).toBe(19133)
  })

  it('serialises concurrent deletes under the locks: the second finds nothing', async () => {
    const k = cluster()
    const results = await Promise.allSettled([run(k), run(k)])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ status: 404 })
    expect(deletes(k).filter(d => !d!.startsWith('job/'))).toHaveLength(4)
  })

  it('never writes a call naming a protected server', async () => {
    const k = cluster()
    await run(k)
    for (const a of writes(k)) for (const p of PROTECTED_NAMES) expect(a.join(' ')).not.toContain(p)
    for (const [i, a] of k.calls.entries()) if (a[0] === 'create') for (const p of PROTECTED_NAMES) expect(k.stdins[i]).not.toContain(p)
  })
})
