import { describe, expect, it } from 'vitest'
import { KubectlError } from '../src/kube/kubectl.js'
import { preflight } from '../src/kube/preflight.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

// can-i args: auth can-i <verb> <resource> -n <ns> [--resource-name <n>]
const parse = (a: string[]) => ({ verb: a[2], resource: a[3], ns: a[a.indexOf('-n') + 1], name: a.includes('--resource-name') ? a[a.indexOf('--resource-name') + 1] : undefined })
const isCanI = (a: string[]) => a[0] === 'auth' && a[1] === 'can-i'
const allYes = () => fakeKubectl([{ match: isCanI, result: { stdout: 'yes\n' } }])
const key = (a: string[]) => { const p = parse(a); return `${p.verb} ${p.resource} ${p.ns}` }

describe('preflight', () => {
  it('asks one can-i per verb of every rbac.md row', async () => {
    const k = allYes()
    expect(await preflight(k)).toEqual({ ok: true, reachable: true, missing: [] })
    const asked = new Set(k.calls.map(key))
    for (const [verb, resource, ns] of [
      ['patch', 'services', 'minecraft-servers'],
      ['patch', 'persistentvolumeclaims', 'minecraft-servers'],
      ['patch', 'ingressrouteudps.traefik.io', 'minecraft-servers'],
      ['watch', 'deployments', 'minecraft-servers'],
      ['watch', 'pods', 'minecraft-servers'],
      ['watch', 'jobs.batch', 'minecraft-servers'],
      ['create', 'pods/exec', 'minecraft-servers'],
      ['get', 'pods/log', 'minecraft-servers'],
      ['patch', 'deployments/scale', 'minecraft-servers'],
      ['delete', 'persistentvolumeclaims', 'minecraft-servers'],
      ['update', 'helmchartconfigs.helm.cattle.io', 'kube-system'],
      ['patch', 'helmchartconfigs.helm.cattle.io', 'kube-system'],
      ['get', 'helmchartconfigs.helm.cattle.io', 'kube-system'],
    ]) expect(asked, `${verb} ${resource}`).toContain(`${verb} ${resource} ${ns}`)
    const traefik = k.calls.filter(a => parse(a).ns === 'kube-system')
    expect(traefik.every(a => parse(a).name === 'traefik')).toBe(true)
  })

  it('lists missing permissions readably', async () => {
    const k = fakeKubectl([{ match: isCanI, result: (a) => ({ stdout: key(a) === 'delete deployments minecraft-servers' || key(a) === 'update helmchartconfigs.helm.cattle.io kube-system' ? 'no\n' : 'yes\n', code: 0 }) }])
    expect(await preflight(k)).toEqual({
      ok: false,
      reachable: true,
      missing: ['delete deployments (minecraft-servers)', 'update helmchartconfigs.helm.cattle.io (kube-system)'],
    })
  })

  it('reports an unreachable cluster without throwing', async () => {
    const k = fakeKubectl([{ match: isCanI, result: () => { throw new KubectlError('unreachable') } }])
    expect(await preflight(k)).toEqual({ ok: false, reachable: false, missing: [] })
  })

  it('caches the result for 10 s', async () => {
    const k = allYes()
    let t = 1000
    await preflight(k, () => t)
    const n = k.calls.length
    t += 9_000
    await preflight(k, () => t)
    expect(k.calls.length).toBe(n)
    t += 2_000
    await preflight(k, () => t)
    expect(k.calls.length).toBe(2 * n)
  })
})
