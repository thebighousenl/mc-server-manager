import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const lines: string[] = []
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'info', logStream: { write: (m: string) => { lines.push(m) } } }
const labels = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz', 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' }
const kubectl = (replicas = 1) => {
  let sent = false
  return fakeKubectl([
  {
    match: a => a[0] === 'get' && a[1] === 'deploy,pods',
    result: {
      stdout: JSON.stringify({
        items: [
          { kind: 'Deployment', metadata: { name: 'bedrock-zz', labels }, spec: { replicas, template: { spec: { containers: [{}] } } } },
          ...(replicas ? [{ kind: 'Pod', metadata: { name: 'bedrock-zz-x', uid: 'route-uid', labels }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }] : []),
        ],
      }),
    },
  },
  { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: '{}' } },
  { match: a => a[0] === 'logs' && a[1] === 'bedrock-zz-x', result: { stdout: 'Server started.' } },
  { match: a => a[0] === 'logs', result: () => ({ stdout: sent ? '[t INFO] There are 1/10 players online:\n[t INFO] Alice\n' : '' }) },
  { match: a => a[0] === 'exec', result: () => { sent = true; return { stdout: '' } } },
  ])
}
const call = (k: ReturnType<typeof kubectl>, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  buildApp(config, { kubectl: k }).inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${secret}`, 'x-operator': 'alice' } })

describe('console routes', () => {
  it('POST command returns the result and logs the operator', async () => {
    lines.length = 0
    const res = await call(kubectl(), 'POST', '/servers/zz/command', { command: 'list' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ command: 'list', truncated: false })
    expect(lines.some(l => l.includes('"action":"command"') && l.includes('"operator":"alice"'))).toBe(true)
  })

  it.each([undefined, {}, { command: 5 }, { command: 'a\nb' }])('POST command body %j is 400 without kubectl', async (body) => {
    const k = kubectl()
    expect((await call(k, 'POST', '/servers/zz/command', body)).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
  })

  it('POST command is 422 when stopped and 404 when unknown', async () => {
    expect((await call(kubectl(0), 'POST', '/servers/zz/command', { command: 'list' })).statusCode).toBe(422)
    expect((await call(kubectl(), 'POST', '/servers/other/command', { command: 'list' })).statusCode).toBe(404)
  })

  it('GET players returns the parsed list', async () => {
    const res = await call(kubectl(), 'GET', '/servers/zz/players')
    expect(res.json()).toEqual({ online: 1, max: 10, players: ['Alice'] })
  })

  it('GET players is 422 when stopped and 400 for a bad name', async () => {
    expect((await call(kubectl(0), 'GET', '/servers/zz/players')).statusCode).toBe(422)
    expect((await call(kubectl(), 'GET', '/servers/Bad_Name/players')).statusCode).toBe(400)
  })
})
