import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { fakeKubectl } from './helpers/fake-kubectl.js'

const secret = 's'.repeat(32)
const config = { ...loadConfig({ MANAGER_SECRET: secret }), logLevel: 'silent' }
const FILE = 'zz-w-20260102T030405Z.tgz'
const kubectl = (missing = false) => fakeKubectl([
  { match: a => a.includes('test'), result: { stdout: '', code: missing ? 1 : 0 } },
  { match: a => a.includes('cat'), result: { stdout: 'TGZDATA' } },
  { match: a => a.some(x => x.includes('stat -c')), result: { stdout: `${FILE}|9\n` } },
])
const get = (k: ReturnType<typeof kubectl>, url: string) =>
  buildApp(config, { kubectl: k }).inject({ method: 'GET', url, headers: { authorization: `Bearer ${secret}` } })

describe('exports routes', () => {
  it('lists exports', async () => {
    const res = await get(kubectl(), '/exports')
    expect(res.json()).toEqual({ exports: [{ file: FILE, server: 'zz', sizeBytes: 9, createdAt: '2026-01-02T03:04:05Z' }] })
  })

  it('streams a file as application/gzip', async () => {
    const res = await get(kubectl(), `/exports/${FILE}`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/gzip')
    expect(res.headers['content-disposition']).toContain(FILE)
    expect(res.body).toBe('TGZDATA')
  })

  it('404 for a missing file', async () => {
    expect((await get(kubectl(true), `/exports/${FILE}`)).statusCode).toBe(404)
  })

  it.each(['nope.tgz', '..%2F..%2Fetc%2Fpasswd', 'zz-w-20260102T030405Z.tar', 'ZZ-w-20260102T030405Z.tgz', 'zz-w%00-20260102T030405Z.tgz'])('400 for %s with zero kubectl calls', async (file) => {
    const k = kubectl()
    expect((await get(k, `/exports/${file}`)).statusCode).toBe(400)
    expect(k.calls).toHaveLength(0)
  })
})
