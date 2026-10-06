import { describe, expect, it } from 'vitest'
import { KubectlError } from '../src/kube/kubectl.js'
import { createServer } from '../src/servers/create.js'
import { PROTECTED_NAMES } from '../src/servers/protect.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const WRITE_VERBS = ['create', 'apply', 'replace', 'delete', 'patch', 'scale', 'label', 'annotate']
const ports = { min: 19132, max: 19999 }
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }

function cluster(o: { existing?: string, failOn?: string, traefikFails?: boolean } = {}) {
  const k = fakeKubectl([
    {
      match: a => a[0] === 'get' && a[1] === 'deploy,pods',
      result: { stdout: JSON.stringify({ items: o.existing ? [{ kind: 'Deployment', metadata: { name: `bedrock-${o.existing}`, labels: { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': o.existing } }, spec: { replicas: 1, template: { spec: { containers: [{ name: 'bedrock', env: [] }] } } } }] : [] }) },
    },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: JSON.stringify(fixture('helmchartconfig-traefik')) } },
    {
      match: a => a[0] === 'create',
      result: () => {
        const obj = JSON.parse(k.stdins.at(-1)!)
        if (obj.kind === o.failOn) throw new KubectlError('failed')
        return { stdout: '' }
      },
    },
    { match: a => a[0] === 'apply', result: () => { if (o.traefikFails) throw new KubectlError('failed'); return { stdout: '' } } },
    { match: a => a[0] === 'replace' || a[0] === 'delete', result: { stdout: '' } },
  ])
  return k
}
const run = (k: ReturnType<typeof cluster>, extra: Record<string, unknown> = {}) =>
  createServer({ kubectl: k, logger, ports }, { name: 'zz', settings: { LEVEL_NAME: 'zz' }, confirm: true, operator: 'alice', ...extra } as never)
const writes = (k: ReturnType<typeof cluster>) => k.calls.filter(a => WRITE_VERBS.includes(a[0]!))
const created = (k: ReturnType<typeof cluster>) => k.calls.flatMap((a, i) => a[0] === 'create' ? [JSON.parse(k.stdins[i]!)] : [])

describe('createServer', () => {
  it('creates PVC, Deployment, Service, IngressRouteUDP, then the Traefik entry last', async () => {
    logs.length = 0
    const k = cluster()
    const res = await run(k)
    expect(created(k).map(o => o.kind)).toEqual(['PersistentVolumeClaim', 'Deployment', 'Service', 'IngressRouteUDP'])
    expect(created(k).every(o => o.metadata.annotations['mc-manager/created-by'] === 'alice')).toBe(true)
    expect(writes(k).map(a => a[0])).toEqual(['create', 'create', 'create', 'create', 'apply', 'replace']) // apply is the server-side dry run
    const entry = JSON.parse(k.stdins.at(-1)!)
    expect(entry.kind).toBe('HelmChartConfig')
    expect(entry.spec.valuesContent).toContain('mc-zz')
    expect(res).toEqual({ server: 'zz', firewall: { port: 19133, protocol: 'udp' } })
    expect(logs.filter((l: any) => l.action === 'create')).toHaveLength(1) // eslint-disable-line @typescript-eslint/no-explicit-any
  })

  it('uses a given free port', async () => {
    const k = cluster()
    expect((await run(k, { port: 19500 })).firewall.port).toBe(19500)
  })

  it.each([undefined, false, 'true', 1])('requires confirm:true (%s)', async (confirm) => {
    const k = cluster()
    await expect(run(k, { confirm })).rejects.toMatchObject({ status: 400 })
    expect(k.calls).toHaveLength(0)
  })

  it.each([
    [{ name: 'Bad Name' }, 400], [{ name: 'events' }, 400], [{ settings: { EULA: 'FALSE' } }, 400],
    [{ port: 19134 }, 400], [{ port: 80 }, 400], [{ port: 20000 }, 400], [{ port: 'x' }, 400],
  ])('rejects %j with no write call', async (extra, status) => {
    const k = cluster()
    await expect(run(k, extra)).rejects.toMatchObject({ status })
    expect(writes(k)).toHaveLength(0)
  })

  it('rejects a duplicate name, including an existing unmanaged server', async () => {
    const k = cluster({ existing: 'zz' })
    await expect(run(k)).rejects.toMatchObject({ status: 409 })
    expect(writes(k)).toHaveLength(0)
  })

  it.each(PROTECTED_NAMES)('never writes for protected name %s (even if it looks absent)', async (name) => {
    const k = cluster()
    await expect(run(k, { name })).rejects.toMatchObject({ status: 403 })
    expect(writes(k)).toHaveLength(0)
  })

  it('on a failure deletes only what this call created, never the Traefik entry, and reports it', async () => {
    logs.length = 0
    const k = cluster({ failOn: 'IngressRouteUDP' })
    await expect(run(k)).rejects.toBeInstanceOf(Error)
    expect(k.calls.filter(a => a[0] === 'delete').map(a => a[1])).toEqual(['service/bedrock-zz', 'deployment/bedrock-zz', 'pvc/bedrock-data-zz'])
    expect(k.calls.some(a => a[0] === 'replace')).toBe(false)
    expect(logs.filter((l: any) => l.action === 'create' && l.outcome === 'failed')).toHaveLength(1) // eslint-disable-line @typescript-eslint/no-explicit-any
  })

  it('a failure on the first object deletes nothing', async () => {
    const k = cluster({ failOn: 'PersistentVolumeClaim' })
    await expect(run(k)).rejects.toBeInstanceOf(Error)
    expect(k.calls.some(a => a[0] === 'delete')).toBe(false)
  })

  it('a failed Traefik edit rolls the four objects back and leaves the five entries alone', async () => {
    const k = cluster({ traefikFails: true })
    await expect(run(k)).rejects.toBeInstanceOf(Error)
    expect(k.calls.filter(a => a[0] === 'delete')).toHaveLength(4)
    expect(k.calls.some(a => a[0] === 'replace')).toBe(false)
    for (const a of k.calls.filter(a => a[0] === 'delete')) for (const p of PROTECTED_NAMES) expect(a.join(' ')).not.toContain(p)
  })
})
