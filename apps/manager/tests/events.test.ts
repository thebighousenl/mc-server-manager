import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'silent' }
const items = [...fixture('deploy-list').items, ...fixture('pods-running').items]
const kubectl = fakeKubectl([
  { match: a => a[1] === 'deploy,pods', result: { stdout: JSON.stringify({ items }) } },
  { match: a => a[0] === 'logs', result: { stdout: 'Server started.' } },
  { match: a => a[1] === 'helmchartconfig', result: { stdout: JSON.stringify({ spec: { valuesContent: 'ports: {}' } }) } },
])

describe('GET /servers/events', () => {
  it('writes the first event immediately and closes cleanly on abort', async () => {
    const app = buildApp(config, { kubectl })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const ctrl = new AbortController()
    const res = await fetch(`http://127.0.0.1:${(app.server.address() as { port: number }).port}/servers/events`, {
      headers: { authorization: `Bearer ${secret}` }, signal: ctrl.signal,
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = new TextDecoder().decode((await res.body!.getReader().read()).value)
    expect(text).toMatch(/^event: servers\ndata: \{.*"clusterOk":true/)
    ctrl.abort()
    await app.close()
  })
})
