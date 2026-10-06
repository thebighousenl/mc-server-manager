import { describe, expect, it } from 'vitest'
import { KubectlError } from '../src/kube/kubectl.js'
import { getServer, listServers } from '../src/servers/list.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const items = [...fixture('deploy-list').items, ...fixture('pods-running').items]
const ports = { daan: 19132, creative: 19134, kontgat: 19140, plaskutje: 19232, gaitie: 19332 }
const valuesContent = 'ports:\n' + Object.entries(ports)
  .map(([n, p]) => `  mc-${n}:\n    port: ${p}\n    exposedPort: ${p}\n    protocol: UDP\n`).join('')
const traefik = JSON.stringify({ spec: { valuesContent } })

const cluster = () => fakeKubectl([
  { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items }) } },
  { match: a => a[0] === 'logs', result: { stdout: 'Server started.' } },
  { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: traefik } },
])

describe('listServers', () => {
  it('makes one workload call and one traefik call and returns the five servers', async () => {
    const kubectl = cluster()
    const res = await listServers(kubectl)
    expect(kubectl.calls.filter(a => a[0] !== 'logs')).toHaveLength(2)
    expect(kubectl.calls.filter(a => a[1] === 'deploy,pods')).toHaveLength(1)
    expect(kubectl.calls).toContainEqual(['get', 'helmchartconfig', 'traefik', '-n', 'kube-system', '-o', 'json'])
    expect(res.clusterOk).toBe(true)
    expect(res.servers.map(s => s.name).sort()).toEqual(['creative', 'daan', 'gaitie', 'kontgat', 'plaskutje'])
    expect(res.servers.find(s => s.name === 'daan')).toMatchObject({ port: 19132, state: 'running', protected: true })
    expect(res.servers.find(s => s.name === 'nginx')).toBeUndefined()
    expect(res.servers[0]).not.toHaveProperty('settings')
  })

  it('reports an unreachable cluster instead of an empty list', async () => {
    const kubectl = fakeKubectl([{ match: () => true, result: () => { throw new KubectlError('unreachable') } }])
    expect(await listServers(kubectl)).toEqual({ servers: [], clusterOk: false, error: 'cluster unreachable' })
  })
})

describe('getServer', () => {
  it('returns detail with settings and resourceVersion', async () => {
    const s = await getServer(cluster(), 'daan')
    expect(s).toMatchObject({ name: 'daan', resourceVersion: '1000' })
    expect(s!.settings.find(x => x.key === 'EULA')).toMatchObject({ editable: false })
  })

  it('returns null for unknown or unrelated names', async () => {
    expect(await getServer(cluster(), 'nginx')).toBeNull()
    expect(await getServer(cluster(), 'nope')).toBeNull()
  })

  it('does not call kubectl for an invalid name', async () => {
    const kubectl = cluster()
    expect(await getServer(kubectl, 'Bad_Name')).toBeNull()
    expect(kubectl.calls).toHaveLength(0)
  })
})
