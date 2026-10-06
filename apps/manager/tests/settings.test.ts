import { describe, expect, it } from 'vitest'
import { KubectlError } from '../src/kube/kubectl.js'
import { getServer } from '../src/servers/list.js'
import { updateSettings } from '../src/servers/settings.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
let n = 0

function cluster(o: { replicas?: number, version?: string, managed?: boolean, worlds?: string, conflict?: boolean } = {}) {
  const uid = `settings-${n++}`
  const env = [
    { name: 'EULA', value: 'TRUE' }, { name: 'TRANSPORT', value: 'udp' }, { name: 'LEVEL_SEED', value: '42' },
    { name: 'VERSION', value: o.version ?? '1.21.50.07' }, { name: 'LEVEL_NAME', value: 'zz' }, { name: 'MAX_PLAYERS', value: '10' },
  ]
  const l = o.managed === false ? { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz' } : labels
  const deployment = { kind: 'Deployment', metadata: { name: 'bedrock-zz', labels: l, resourceVersion: '77' }, spec: { replicas: o.replicas ?? 1, template: { spec: { containers: [{ name: 'bedrock', env }] } } } }
  const pod = { kind: 'Pod', metadata: { name: 'bedrock-zz-x', uid, labels }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }
  return fakeKubectl([
    { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items: [deployment, ...(o.replicas === 0 ? [] : [pod])] }) } },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
    { match: a => a[0] === 'get' && a[1] === 'deploy/bedrock-zz', result: { stdout: JSON.stringify(deployment) } },
    { match: a => a[0] === 'logs', result: { stdout: 'Server started.' } },
    { match: a => a[0] === 'exec', result: { stdout: o.worlds ?? 'zz\nolder\n' } },
    {
      match: a => a[0] === 'patch',
      result: () => {
        if (o.conflict) throw new KubectlError('conflict')
        return { stdout: '' }
      },
    },
  ])
}
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }
const run = (k: ReturnType<typeof cluster>, settings: unknown, extra: object = {}) =>
  updateSettings({ kubectl: k, logger }, 'zz', { settings, resourceVersion: '77', confirm: true, operator: 'alice', ...extra } as never)
const patches = (k: ReturnType<typeof cluster>) => k.calls.filter(a => a[0] === 'patch')

describe('updateSettings', () => {
  it('requires confirm:true', async () => {
    const k = cluster()
    await expect(run(k, { MAX_PLAYERS: '20' }, { confirm: false })).rejects.toMatchObject({ status: 400 })
    expect(k.calls).toHaveLength(0)
  })

  it.each([{ EULA: 'FALSE' }, { TRANSPORT: 'tcp' }, { LEVEL_SEED: '1' }, { MAX_PLAYERS: '0' }, { NOPE: 'x' }, {}])('rejects %j with 400 and sends nothing', async (settings) => {
    const k = cluster()
    await expect(run(k, settings)).rejects.toMatchObject({ status: 400 })
    expect(k.calls).toHaveLength(0)
  })

  it('sends one strategic patch with only the changed env entries and the resourceVersion', async () => {
    logs.length = 0
    const k = cluster()
    const res = await run(k, { MAX_PLAYERS: '20', GAMEMODE: 'creative' })
    const [call] = patches(k)
    expect(patches(k)).toHaveLength(1)
    expect(call!.slice(0, 3)).toEqual(['patch', 'deploy/bedrock-zz', '--type=strategic'])
    const body = JSON.parse(call![call!.indexOf('-p') + 1]!)
    expect(body.metadata.resourceVersion).toBe('77')
    expect(body.spec.template.spec.containers).toEqual([{ name: 'bedrock', env: [{ name: 'MAX_PLAYERS', value: '20' }, { name: 'GAMEMODE', value: 'creative' }] }])
    expect(res.warnings).toEqual([])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ operator: 'alice', server: 'zz', action: 'settings', outcome: 'ok' })
  })

  it('maps a kubectl conflict to 409 stale with a reload message', async () => {
    logs.length = 0
    await expect(run(cluster({ conflict: true }), { MAX_PLAYERS: '20' })).rejects.toMatchObject({ status: 409, code: 'stale', message: expect.stringMatching(/reload/i) })
    expect(logs[0]).toMatchObject({ outcome: 'failed' })
  })

  it('warns when VERSION is LATEST', async () => {
    expect((await run(cluster({ version: 'LATEST' }), { MAX_PLAYERS: '20' })).warnings).toHaveLength(1)
  })

  it('accepts a LEVEL_NAME that exists on a running server', async () => {
    const k = cluster()
    await run(k, { LEVEL_NAME: 'older' })
    expect(k.calls.find(a => a[0] === 'exec')).toEqual(['exec', 'deploy/bedrock-zz', '--', 'ls', '/data/worlds'])
    expect(patches(k)).toHaveLength(1)
  })

  it('rejects a LEVEL_NAME that is not an existing world, or when not running, with 422', async () => {
    const missing = cluster()
    await expect(run(missing, { LEVEL_NAME: 'nope' })).rejects.toMatchObject({ status: 422 })
    expect(patches(missing)).toHaveLength(0)
    await expect(run(cluster({ replicas: 0 }), { LEVEL_NAME: 'older' })).rejects.toMatchObject({ status: 422 })
  })

  it('refuses unmanaged servers', async () => {
    await expect(run(cluster({ managed: false }), { MAX_PLAYERS: '20' })).rejects.toThrow(/adopt/)
  })
})

describe('getServer read side', () => {
  it('marks keys editable per the allow-list', async () => {
    const s = await getServer(cluster(), 'zz')
    const editable = Object.fromEntries(s!.settings.map(x => [x.key, x.editable]))
    expect(editable).toMatchObject({ EULA: false, TRANSPORT: false, LEVEL_SEED: false, VERSION: true, MAX_PLAYERS: true })
  })
})
