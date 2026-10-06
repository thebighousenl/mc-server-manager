import { describe, expect, it } from 'vitest'
import { adopt, planAdopt } from '../src/servers/adopt.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const KINDS = ['Deployment', 'Service', 'IngressRouteUDP', 'PersistentVolumeClaim']

// Mutable fake cluster: `label` calls add labels, `drift` simulates a restart during adoption.
function cluster(name: string, opts: { objects?: boolean, drift?: boolean } = {}) {
  const state = { generation: 3, labels: {} as Record<string, Record<string, string>>, uid: 'uid-1' }
  const base = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': name }
  const kubectl = fakeKubectl([
    {
      match: a => a[0] === 'get',
      result: () => ({
        stdout: JSON.stringify({
          items: opts.objects === false ? [] : [
            ...KINDS.map(kind => ({
              kind, metadata: { name: kind === 'PersistentVolumeClaim' ? `bedrock-data-${name}` : `bedrock-${name}`, generation: state.generation, labels: { ...base, ...state.labels[kind] } },
            })),
            { kind: 'Pod', metadata: { name: `bedrock-${name}-x`, uid: state.uid, labels: base } },
          ],
        }),
      }),
    },
    {
      match: a => a[0] === 'label',
      result: (a) => {
        const kind = KINDS.find(k => k.toLowerCase() === a[1]!.split('/')[0])!
        state.labels[kind] = Object.fromEntries(a.slice(2).filter(x => x.includes('=')).map(x => x.split('=') as [string, string]))
        if (opts.drift) state.uid = 'uid-2'
        return { stdout: '' }
      },
    },
  ])
  return kubectl
}
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }
const run = (kubectl: ReturnType<typeof cluster>, name: string, confirm = true) =>
  adopt({ kubectl, logger }, name, { confirm, operator: 'alice' })

describe('planAdopt', () => {
  it('returns the label diff for the four objects using only get calls', async () => {
    const kubectl = cluster('zz')
    const plan = await planAdopt(kubectl, 'zz')
    expect(plan.changes.map(c => c.kind)).toEqual(KINDS)
    expect(plan.changes[0]!.add).toEqual({ 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' })
    expect(kubectl.calls.every(a => a[0] === 'get')).toBe(true)
  })

  it('marks the five known names protected', async () => {
    const plan = await planAdopt(cluster('daan'), 'daan')
    expect(plan.changes[0]!.add['mc-manager/protected']).toBe('true')
  })

  it('refuses a name without bedrock objects with 404', async () => {
    await expect(planAdopt(cluster('zz', { objects: false }), 'zz')).rejects.toMatchObject({ status: 404 })
  })
})

describe('adopt', () => {
  it('labels the four objects with kubectl label only, then is idempotent', async () => {
    logs.length = 0
    const kubectl = cluster('zz')
    const res = await run(kubectl, 'zz')
    expect(res.changed).toBe(true)
    const verbs = new Set(kubectl.calls.map(a => a[0]))
    expect([...verbs].sort()).toEqual(['get', 'label'])
    expect(kubectl.calls.filter(a => a[0] === 'label')).toHaveLength(4)
    expect(kubectl.calls.find(a => a[0] === 'label')).toEqual(['label', 'deployment/bedrock-zz', 'mc-manager/managed=true', 'mc-manager/server=zz', '--overwrite'])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ operator: 'alice', server: 'zz', action: 'adopt', outcome: 'ok' })

    const again = await run(kubectl, 'zz')
    expect(again).toMatchObject({ changed: false, message: 'no changes' })
    expect(kubectl.calls.filter(a => a[0] === 'label')).toHaveLength(4)
  })

  it('requires confirm:true', async () => {
    await expect(run(cluster('zz'), 'zz', false)).rejects.toMatchObject({ status: 400 })
  })

  it('fails and logs when a pod UID changed during adoption', async () => {
    logs.length = 0
    await expect(run(cluster('zz', { drift: true }), 'zz')).rejects.toThrow(/restart/)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: 'adopt', outcome: 'failed' })
  })

  it('takes the per-server lock so concurrent adopts label once', async () => {
    const kubectl = cluster('zz')
    await Promise.all([run(kubectl, 'zz'), run(kubectl, 'zz')])
    expect(kubectl.calls.filter(a => a[0] === 'label')).toHaveLength(4)
  })
})
