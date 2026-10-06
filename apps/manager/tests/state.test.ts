import { describe, expect, it } from 'vitest'
import { deriveServers } from '../src/kube/state.js'
import { fixture } from './helpers/fake-kubectl.js'

const deployments = fixture('deploy-list').items
const NOW = Date.parse('2026-01-02T00:00:00Z')
const opts = (over = {}) => ({
  traefikPorts: { daan: 19132, creative: 19134, kontgat: 19140, plaskutje: 19232, gaitie: 19332 },
  serverStarted: () => true,
  now: () => NOW,
  ...over,
})
const derive = (deps: unknown[], pods: string, over = {}) =>
  deriveServers(deps as never, fixture(pods).items, opts(over))
const daan = (servers: ReturnType<typeof derive>) => servers.find(s => s.name === 'daan')!

describe('deriveServers', () => {
  it('excludes unrelated deployments and lists the five servers', () => {
    const servers = derive(deployments, 'pods-running')
    expect(servers.map(s => s.name).sort()).toEqual(['creative', 'daan', 'gaitie', 'kontgat', 'plaskutje'])
  })

  it('builds the Server shape', () => {
    expect(daan(derive(deployments, 'pods-running'))).toMatchObject({
      name: 'daan', worldName: 'daan', gameMode: 'survival', port: 19132, state: 'running', desired: 'running',
      protected: true, managed: true, ageSeconds: 86400, resourceVersion: '1000',
    })
  })

  it('marks the unlabelled gaitie as unmanaged but protected by name', () => {
    const gaitie = derive(deployments, 'pods-none').find(s => s.name === 'gaitie')!
    expect(gaitie).toMatchObject({ managed: false, protected: true, worldName: 'Gaitie World' })
  })

  it('protected follows the label for other names', () => {
    const d = structuredClone(deployments[0])
    d.metadata.name = 'bedrock-zz'
    d.metadata.labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
    expect(deriveServers([d], [], opts())[0]).toMatchObject({ name: 'zz', protected: false })
    d.metadata.labels['mc-manager/protected'] = 'true'
    expect(deriveServers([d], [], opts())[0]).toMatchObject({ protected: true })
  })

  it('port is null when Traefik has no entry', () => {
    expect(daan(derive(deployments, 'pods-running', { traefikPorts: {} })).port).toBeNull()
  })

  it('settings come from the container env with editable flags', () => {
    const s = daan(derive(deployments, 'pods-running')).settings
    expect(s).toContainEqual({ key: 'MAX_PLAYERS', value: '10', editable: true })
    expect(s).toContainEqual({ key: 'EULA', value: 'TRUE', editable: false })
    expect(s).toContainEqual({ key: 'TRANSPORT', value: 'udp', editable: false })
  })

  describe('state', () => {
    const only = [deployments[0]]
    it('stopped: replicas 0, no pods', () => {
      expect(daan(derive(fixture('deploy-stopped').items, 'pods-none'))).toMatchObject({ state: 'stopped', desired: 'stopped' })
    })
    it('stopping: replicas 0, pod still present', () => {
      expect(daan(derive(fixture('deploy-stopped').items, 'pods-running')).state).toBe('stopping')
    })
    it('starting: pod not ready', () => {
      expect(daan(derive(only, 'pods-starting')).state).toBe('starting')
    })
    it('starting: pod ready but server not started', () => {
      expect(daan(derive(only, 'pods-running', { serverStarted: () => false })).state).toBe('starting')
    })
    it('starting: replicas 1 and no pod yet', () => {
      expect(daan(derive(only, 'pods-none')).state).toBe('starting')
    })
    it('running: ready and started', () => {
      expect(daan(derive(only, 'pods-running')).state).toBe('running')
    })
    it('failing: CrashLoopBackOff', () => {
      expect(daan(derive(only, 'pods-crashloop')).state).toBe('failing')
    })
    it.each(['ImagePullBackOff', 'ErrImagePull'])('failing: %s', (reason) => {
      const pods = fixture('pods-crashloop').items
      pods[0].status.containerStatuses[0].state.waiting.reason = reason
      expect(deriveServers(only, pods, opts())[0]!.state).toBe('failing')
    })
    it('failing: Unschedulable', () => {
      const pods = fixture('pods-starting').items
      pods[0].status.conditions = [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable' }]
      expect(deriveServers(only, pods, opts())[0]!.state).toBe('failing')
    })
    it('serverStarted is asked per pod uid', () => {
      const asked: string[] = []
      derive(only, 'pods-running', { serverStarted: (uid: string) => (asked.push(uid), true) })
      expect(asked).toEqual(['uid-daan'])
    })
  })
})
