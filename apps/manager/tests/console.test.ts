import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPlayers, sendCommand } from '../src/servers/console.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const text = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
let n = 0

// Pod UIDs are unique per cluster because the started-tracker is shared.
function cluster(o: { replicas?: number, output?: string } = {}) {
  const uid = `console-${n++}`
  const pod = { kind: 'Pod', metadata: { name: 'bedrock-zz-x', uid, labels }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }
  return fakeKubectl([
    {
      match: a => a[0] === 'get' && a[1] === 'deploy,pods',
      result: { stdout: JSON.stringify({ items: [{ kind: 'Deployment', metadata: { name: 'bedrock-zz', labels }, spec: { replicas: o.replicas ?? 1, template: { spec: { containers: [{}] } } } }, ...(o.replicas === 0 ? [] : [pod])] }) },
    },
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
    { match: a => a[0] === 'logs' && a[1] === 'bedrock-zz-x', result: { stdout: 'Server started.' } },
    { match: a => a[0] === 'logs', result: { stdout: o.output ?? '' } },
    { match: a => a[0] === 'exec', result: { stdout: '' } },
  ])
}
const logs: object[] = []
const logger = { info: (o: object) => { logs.push(o) } }
const deps = (kubectl: ReturnType<typeof cluster>) => ({ kubectl, logger, pollMs: 1, timeoutMs: 50 })
const o = { operator: 'alice' }

describe('sendCommand', () => {
  it('passes each word as its own argument, never through a shell', async () => {
    const k = cluster({ output: '[t INFO] hi\n' })
    await sendCommand(deps(k), 'zz', 'say hi; rm -rf /', o)
    expect(k.calls.find(a => a[0] === 'exec')).toEqual(['exec', 'deploy/bedrock-zz', '--', 'send-command', 'say', 'hi;', 'rm', '-rf', '/'])
  })

  it('returns the output lines as soon as they appear', async () => {
    const k = cluster({ output: '[t INFO] Set the time to 0\n' })
    const started = Date.now()
    const res = await sendCommand({ ...deps(k), timeoutMs: 2000 }, 'zz', 'time set day', o)
    expect(res).toEqual({ command: 'time set day', lines: ['[t INFO] Set the time to 0'], truncated: false })
    expect(Date.now() - started).toBeLessThan(500)
    expect(k.calls.find(a => a[0] === 'logs' && a[1] === 'deploy/bedrock-zz')![2]).toMatch(/^--since-time=\d{4}-/)
  })

  it('gives up after the cap with no lines', async () => {
    const res = await sendCommand(deps(cluster()), 'zz', 'noop', o)
    expect(res.lines).toEqual([])
  })

  it('validates the command before touching kubectl', async () => {
    const k = cluster()
    await expect(sendCommand(deps(k), 'zz', 'a\nb', o)).rejects.toMatchObject({ status: 400 })
    expect(k.calls).toHaveLength(0)
  })

  it('refuses with 422 when the server is not running', async () => {
    const k = cluster({ replicas: 0 })
    await expect(sendCommand(deps(k), 'zz', 'list', o)).rejects.toMatchObject({ status: 422 })
    expect(k.calls.some(a => a[0] === 'exec')).toBe(false)
  })

  it('404 for an unknown server', async () => {
    await expect(sendCommand(deps(cluster()), 'other', 'list', o)).rejects.toMatchObject({ status: 404 })
  })

  it('logs one action record per command with the text truncated', async () => {
    logs.length = 0
    await sendCommand(deps(cluster({ output: 'x\n' })), 'zz', 'say ' + 'a'.repeat(250), o)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ operator: 'alice', server: 'zz', action: 'command', outcome: 'ok' })
    expect((logs[0] as { detail: string }).detail.length).toBeLessThanOrEqual(100)
  })
})

describe('getPlayers', () => {
  it('sends list and parses online, max and names', async () => {
    const k = cluster({ output: text('list-two-players.txt') })
    expect(await getPlayers(deps(k), 'zz')).toEqual({ online: 2, max: 10, players: ['PlayerOne', 'Player Two'] })
    expect(k.calls.find(a => a[0] === 'exec')).toEqual(['exec', 'deploy/bedrock-zz', '--', 'send-command', 'list'])
  })

  it('parses an empty server', async () => {
    expect(await getPlayers(deps(cluster({ output: text('list-none.txt') })), 'zz')).toEqual({ online: 0, max: 10, players: [] })
  })

  it('refuses with 422 when the server is not running', async () => {
    await expect(getPlayers(deps(cluster({ replicas: 0 })), 'zz')).rejects.toMatchObject({ status: 422 })
  })
})
