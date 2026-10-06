import { describe, expect, it } from 'vitest'
import { KubectlError } from '../src/kube/kubectl.js'
import { preflight } from '../src/kube/preflight.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const MC = 'minecraft-servers'
const rows: [string, string[], string][] = [
  ['deployments', ['get', 'list', 'watch', 'patch', 'create', 'delete'], MC],
  ['deployments/scale', ['get', 'list', 'watch', 'patch', 'create', 'delete'], MC],
  ['pods', ['get', 'list', 'watch'], MC],
  ['pods/log', ['get', 'list', 'watch'], MC],
  ['pods/exec', ['create'], MC],
  ['services', ['get', 'list', 'patch', 'create', 'delete'], MC],
  ['persistentvolumeclaims', ['get', 'list', 'patch', 'create', 'delete'], MC],
  ['ingressrouteudps', ['get', 'list', 'patch', 'create', 'delete'], MC],
  ['jobs', ['get', 'list', 'watch', 'create', 'delete'], MC],
  ['helmchartconfigs/traefik', ['get', 'update', 'patch'], 'kube-system'],
]
const expected = rows.flatMap(([res, verbs, ns]) => verbs.map((v) => `${v} ${res} (${ns})`))

/** `auth can-i <verb> <resource>[/name] --namespace <ns> [--subresource=x]` -> `verb resource[/sub|/name] (ns)`. */
function describeCall(args: string[]): string {
  expect(args.slice(0, 2)).toEqual(['auth', 'can-i'])
  const [verb, ref] = [args[2]!, args[3]!]
  const ns = args[args.indexOf('--namespace') + 1]
  const sub = args.find((a) => a.startsWith('--subresource='))?.slice(14)
  const [kind, name] = ref.split('/')
  const resource = kind!.split('.')[0]
  return `${verb} ${resource}${sub ? `/${sub}` : ''}${name ? `/${name}` : ''} (${ns})`
}

const answering = (denied: string[] = []) =>
  fakeKubectl([
    {
      match: (a) => a[0] === 'auth',
      result: (a) => (denied.includes(describeCall(a)) ? { stdout: 'no\n', code: 1 } : { stdout: 'yes\n' }),
    },
  ])

describe('preflight', () => {
  it('checks one auth can-i per verb of each row of the permission table', async () => {
    const k = answering()
    const res = await preflight(k)
    expect(res).toEqual({ ok: true, reachable: true, missing: [] })
    expect(k.calls.map(describeCall).sort()).toEqual([...expected].sort())
  })

  it('reports missing permissions as readable "verb resource (namespace)"', async () => {
    const res = await preflight(answering(['patch services (minecraft-servers)', 'watch pods (minecraft-servers)', 'update helmchartconfigs/traefik (kube-system)']))
    expect(res.ok).toBe(false)
    expect(res.reachable).toBe(true)
    expect([...res.missing].sort()).toEqual(
      ['patch services (minecraft-servers)', 'update helmchartconfigs/traefik (kube-system)', 'watch pods (minecraft-servers)'].sort(),
    )
  })

  it('counts a thrown "no" answer (non-zero exit) as missing, not as unreachable', async () => {
    const k = fakeKubectl([
      {
        match: () => true,
        result: (a) => {
          if (describeCall(a) !== 'create pods/exec (minecraft-servers)') return { stdout: 'yes' }
          throw new KubectlError('failed', undefined, { stdout: 'no\n' })
        },
      },
    ])
    expect(await preflight(k)).toEqual({ ok: false, reachable: true, missing: ['create pods/exec (minecraft-servers)'] })
  })

  it('uses the configured namespace for namespaced rows', async () => {
    const k = answering()
    await preflight(k, { namespace: 'mc-test' })
    const described = k.calls.map(describeCall)
    expect(described).toContain('get deployments (mc-test)')
    expect(described).toContain('get helmchartconfigs/traefik (kube-system)')
    expect(described.some((d) => d.includes(`(${MC})`))).toBe(false)
  })

  it('returns reachable:false when the cluster is unreachable, without throwing', async () => {
    const k = fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('unreachable') } }])
    expect(await preflight(k)).toEqual({ ok: false, reachable: false, missing: [] })
  })

  it('never throws, even on unexpected errors', async () => {
    const k = fakeKubectl([{ match: () => true, result: () => { throw new TypeError('boom') } }])
    expect(await preflight(k)).toEqual({ ok: false, reachable: false, missing: [] })
  })

  it('caches the result for 10 seconds', async () => {
    const k = answering()
    let t = 1_000
    const now = () => t
    await preflight(k, { now })
    const n = k.calls.length
    t += 9_999
    await preflight(k, { now })
    expect(k.calls.length).toBe(n)
    t += 2
    await preflight(k, { now })
    expect(k.calls.length).toBe(2 * n)
  })

  it('shares one in-flight check between concurrent callers', async () => {
    const k = answering()
    await Promise.all([preflight(k), preflight(k)])
    expect(k.calls.length).toBe(expected.length)
  })
})
