import { describe, expect, it } from 'vitest'
import { KubectlError } from '../src/kube/kubectl.js'
import { ensureExportsVolume, exportWorld, listExports, readExport } from '../src/servers/exports.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
const exportsCfg = { size: '30Gi', storageClass: 'fast' }
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }
const WRITE_VERBS = ['create', 'apply', 'replace', 'delete', 'patch', 'scale', 'label']

function cluster(o: { replicas?: number, volume?: boolean, job?: 'ok' | 'fail' | 'never', files?: string, missing?: boolean, noWorld?: boolean } = {}) {
  const deployment = { kind: 'Deployment', metadata: { name: 'bedrock-zz', labels, resourceVersion: '1' }, spec: { replicas: o.replicas ?? 0, template: { spec: { containers: [{ name: 'bedrock', env: [] }] } } } }
  const pod = { kind: 'Pod', metadata: { name: 'p', uid: `u-${Math.random()}`, labels }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }
  const k = fakeKubectl([
    { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items: [deployment, ...(o.replicas ? [pod] : [])] }) } },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
    { match: a => a[0] === 'logs' && a[1]?.startsWith('job/'), result: { stdout: o.noWorld ? 'no-world\n' : '' } },
    { match: a => a[0] === 'logs', result: { stdout: 'Server started.' } },
    { match: a => a[0] === 'get' && /^(pvc|deploy)\/mc-exports$/.test(a[1]!), result: { stdout: o.volume ? 'x/mc-exports\n' : '' } },
    { match: a => a[0] === 'get' && a[1]?.startsWith('job/'), result: { stdout: JSON.stringify({ status: o.job === 'ok' ? { succeeded: 1 } : o.job === 'fail' ? { failed: 1 } : {} }) } },
    { match: a => a[0] === 'exec' && a.includes('test'), result: { stdout: '', code: o.missing ? 1 : 0 } },
    { match: a => a[0] === 'exec' && a.some(x => x.includes('stat -c')), result: { stdout: o.files ?? '' } },
    { match: a => a[0] === 'exec' && a.includes('cat'), result: { stdout: 'TGZ' } },
    { match: a => ['create', 'delete', 'rollout'].includes(a[0]!), result: { stdout: '' } },
  ])
  return k
}
const objs = (k: ReturnType<typeof cluster>) => k.calls.flatMap((a, i) => a[0] === 'create' ? [JSON.parse(k.stdins[i]!)] : [])
const deps = (k: ReturnType<typeof cluster>) => ({ kubectl: k, logger, exports: exportsCfg, timeoutMs: 100, pollMs: 1 })

describe('ensureExportsVolume', () => {
  it('creates the PVC and the Deployment when absent', async () => {
    const k = cluster()
    await ensureExportsVolume(deps(k))
    const [pvc, dep] = objs(k)
    expect(pvc.kind).toBe('PersistentVolumeClaim')
    expect(pvc.metadata.name).toBe('mc-exports')
    expect(pvc.spec.storageClassName).toBe('fast')
    expect(pvc.spec.resources.requests.storage).toBe('30Gi')
    expect(dep.metadata.name).toBe('mc-exports')
    expect(dep.spec.template.spec.containers[0].image).toBe('busybox:1.37')
    expect(dep.spec.template.spec.containers[0].command[0]).toBe('sleep')
    expect(dep.spec.template.metadata.labels['app.kubernetes.io/name']).not.toBe('bedrock')
  })

  it('creates nothing when present and never deletes', async () => {
    const k = cluster({ volume: true })
    await ensureExportsVolume(deps(k))
    expect(k.calls.filter(a => WRITE_VERBS.includes(a[0]!))).toHaveLength(0)
  })
})

describe('exportWorld', () => {
  it('requires the server to be stopped', async () => {
    const k = cluster({ replicas: 1, volume: true })
    await expect(exportWorld(deps(k), 'zz', 'zz', 'alice')).rejects.toMatchObject({ status: 409 })
    expect(k.calls.filter(a => WRITE_VERBS.includes(a[0]!))).toHaveLength(0)
  })

  it('404 for an unknown server', async () => {
    await expect(exportWorld(deps(cluster({ volume: true })), 'nope', 'zz', 'alice')).rejects.toMatchObject({ status: 404 })
  })

  it.each(['../x', 'a/b', '', 'x;y', 'a'.repeat(65)])('rejects level %j before any write', async (level) => {
    const k = cluster({ volume: true })
    await expect(exportWorld(deps(k), 'zz', level, 'alice')).rejects.toMatchObject({ status: 400 })
    expect(k.calls.filter(a => WRITE_VERBS.includes(a[0]!))).toHaveLength(0)
  })

  it('runs a Job with only the server PVC (read-only) and mc-exports, waits, deletes it and returns the file', async () => {
    logs.length = 0
    const k = cluster({ volume: true, job: 'ok' })
    const file = await exportWorld(deps(k), 'zz', 'My World', 'alice')
    expect(file).toMatch(/^zz-My World-\d{8}T\d{6}Z\.tgz$/)
    const [job] = objs(k)
    expect(job.kind).toBe('Job')
    const spec = job.spec.template.spec
    expect(spec.restartPolicy).toBe('Never')
    expect(spec.containers[0].image).toBe('busybox:1.37')
    const [sh, c, script, ...args] = spec.containers[0].command
    expect([sh, c, ...args]).toEqual(['sh', '-c', 'export', file, 'My World'])
    expect(script).toContain('tar czf "/exports/$1" -C /data/worlds -- "$2"')
    expect(script).toContain('tar czf "/exports/$1" -C /data/worlds -- .') // another world exists under a different name: export it all
    expect(spec.volumes.map((v: { persistentVolumeClaim: { claimName: string } }) => v.persistentVolumeClaim.claimName).sort()).toEqual(['bedrock-data-zz', 'mc-exports'])
    expect(spec.volumes.find((v: { persistentVolumeClaim: { claimName: string } }) => v.persistentVolumeClaim.claimName === 'bedrock-data-zz').persistentVolumeClaim.readOnly).toBe(true)
    expect(spec.containers[0].volumeMounts.find((m: { mountPath: string }) => m.mountPath === '/data/worlds' || m.mountPath === '/data').readOnly).toBe(true)
    expect(k.calls.some(a => a[0] === 'delete' && a[1]!.startsWith('job/'))).toBe(true)
    expect(k.calls.filter(a => a[0] === 'delete').every(a => a[1]!.startsWith('job/'))).toBe(true)
    expect(logs.filter((l: any) => l.action === 'export' && l.outcome === 'ok')).toHaveLength(1) // eslint-disable-line @typescript-eslint/no-explicit-any
  })

  it('returns null when the world directory does not exist (the server never ran)', async () => {
    const k = cluster({ volume: true, job: 'ok', noWorld: true })
    expect(await exportWorld(deps(k), 'zz', 'My World', 'alice')).toBeNull()
    const script = objs(k)[0].spec.template.spec.containers[0].command[2]
    // Only an empty /data/worlds is skipped, never just a missing level directory.
    expect(script).toContain('ls -A /data/worlds')
  })

  it.each(['fail', 'never'] as const)('a %s Job is an error, not a partial success, and issues no delete at all', async (job) => {
    const k = cluster({ volume: true, job })
    await expect(exportWorld(deps(k), 'zz', 'zz', 'alice')).rejects.toMatchObject({ status: 409 })
    expect(k.calls.some(a => a[0] === 'delete')).toBe(false)
  })

  it('creates the exports volume first when missing', async () => {
    const k = cluster({ job: 'ok' })
    await exportWorld(deps(k), 'zz', 'zz', 'alice')
    expect(objs(k).map(o => o.kind)).toEqual(['PersistentVolumeClaim', 'Deployment', 'Job'])
  })

  it('a cluster failure creating the Job is reported', async () => {
    const k = fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('unreachable') } }])
    await expect(exportWorld(deps(k as never), 'zz', 'zz', 'alice')).rejects.toBeInstanceOf(KubectlError)
  })
})

describe('listExports / readExport', () => {
  it('lists valid files with size and the time from the file name; skips invalid names', async () => {
    const k = cluster({ files: 'zz-My World-20260102T030405Z.tgz|1234\nbad name.tgz|1\n../x.tgz|3\ndaan-w-20260102T030405Z.tgz|7\n' })
    const list = await listExports(k)
    expect(list).toEqual([
      { file: 'zz-My World-20260102T030405Z.tgz', server: 'zz', sizeBytes: 1234, createdAt: '2026-01-02T03:04:05Z' },
      { file: 'daan-w-20260102T030405Z.tgz', server: 'daan', sizeBytes: 7, createdAt: '2026-01-02T03:04:05Z' },
    ])
  })

  it('lists nothing when the exports pod does not exist yet', async () => {
    const k = fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('notfound') } }])
    expect(await listExports(k)).toEqual([])
  })

  it.each(['../etc/passwd', 'a.tgz', 'zz-w-20260102T030405Z.tar', 'zz-w-20260102T030405Z.tgz/../x', '', 42])('readExport rejects %j with no kubectl call', async (file) => {
    const k = cluster()
    await expect(readExport(k, file as string)).rejects.toMatchObject({ status: 400 })
    expect(k.calls).toHaveLength(0)
  })

  it('streams a valid file through spawn and returns null when it does not exist', async () => {
    const k = cluster()
    const child = await readExport(k, 'zz-w-20260102T030405Z.tgz')
    expect(child).not.toBeNull()
    expect(k.calls.at(-1)).toEqual(['exec', 'deploy/mc-exports', '--', 'cat', '/exports/zz-w-20260102T030405Z.tgz'])
    expect(await readExport(cluster({ missing: true }), 'zz-w-20260102T030405Z.tgz')).toBeNull()
  })
})
