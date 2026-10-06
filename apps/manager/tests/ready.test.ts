import { describe, expect, it } from 'vitest'
import { listServers } from '../src/servers/list.js'
import { createStartedTracker, serverStarted } from '../src/servers/ready.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const STARTUP = 'Starting Server\nINFO] Level Name: daan\n'

describe('serverStarted', () => {
  it('is true once the log has Server started.', () => {
    expect(serverStarted(`${STARTUP}[INFO] Server started.\n`)).toBe(true)
  })
  it('is false for the earlier startup lines only', () => {
    expect(serverStarted(STARTUP)).toBe(false)
  })
})

describe('startedTracker', () => {
  it('remembers a pod UID once seen started, even when the line scrolls out of the tail', () => {
    const t = createStartedTracker()
    expect(t.check('uid-1', STARTUP)).toBe(false)
    expect(t.check('uid-1', 'Server started.\n')).toBe(true)
    const later = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n')
    expect(t.check('uid-1', later)).toBe(true)
    expect(t.has('uid-1')).toBe(true)
  })
  it('treats a new pod UID (restart) as not started', () => {
    const t = createStartedTracker()
    t.check('uid-1', 'Server started.')
    expect(t.has('uid-2')).toBe(false)
  })
})

describe('listServers with the tracker', () => {
  const items = [...fixture('deploy-list').items, ...fixture('pods-running').items]
  const traefik = JSON.stringify({ spec: { valuesContent: 'ports:\n  mc-daan:\n    exposedPort: 19132\n' } })
  const cluster = (log: string) => fakeKubectl([
    { match: a => a[0] === 'get' && a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items }) } },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: traefik } },
    { match: a => a[0] === 'logs', result: { stdout: log } },
  ])
  const logCalls = (k: ReturnType<typeof cluster>) => k.calls.filter(a => a[0] === 'logs')

  it('reads logs for Ready untracked pods, reports running and never asks again', async () => {
    const tracker = createStartedTracker()
    const k = cluster('Server started.\n')
    const first = await listServers(k, { tracker })
    expect(first.servers.every(s => s.state === 'running')).toBe(true)
    expect(logCalls(k).length).toBeGreaterThan(0)
    expect(logCalls(k)[0]).toEqual(['logs', 'bedrock-daan-abc12', '--tail=2000'])
    const before = logCalls(k).length
    await listServers(k, { tracker })
    expect(logCalls(k)).toHaveLength(before)
  })

  it('stays starting while the log has no Server started. line, and keeps asking', async () => {
    const tracker = createStartedTracker()
    const k = cluster(STARTUP)
    expect((await listServers(k, { tracker })).servers.every(s => s.state === 'starting')).toBe(true)
    const before = logCalls(k).length
    await listServers(k, { tracker })
    expect(logCalls(k).length).toBe(before * 2)
  })
})
