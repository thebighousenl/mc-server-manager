import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const secret = 's'.repeat(32)
const app = buildApp({ secret, host: '127.0.0.1', port: 3001, logLevel: 'silent' })
const get = (authorization?: string) =>
  app.inject({ method: 'GET', url: '/health', headers: authorization ? { authorization } : {} })

describe('GET /health', () => {
  it('returns 200 with status and uptime for a valid Bearer secret', async () => {
    const res = await get(`Bearer ${secret}`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.uptimeSeconds).toBe('number')
  })

  it.each([
    ['no header', undefined],
    ['wrong secret', 'Bearer nope'],
    ['same-length wrong secret', `Bearer ${'x'.repeat(32)}`],
    ['non-Bearer scheme', `Basic ${secret}`],
  ])('returns 401 for %s', async (_name, header) => {
    const res = await get(header)
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'unauthorized' })
  })
})
