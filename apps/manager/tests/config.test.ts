import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const secret = 's'.repeat(32)

describe('loadConfig', () => {
  it('throws when MANAGER_SECRET is unset', () => {
    expect(() => loadConfig({})).toThrow(/MANAGER_SECRET/)
  })

  it('throws when MANAGER_SECRET is shorter than 32 chars', () => {
    expect(() => loadConfig({ MANAGER_SECRET: 's'.repeat(31) })).toThrow(/MANAGER_SECRET/)
  })

  it('defaults host to 127.0.0.1 and port to 3001', () => {
    expect(loadConfig({ MANAGER_SECRET: secret })).toEqual({ secret, host: '127.0.0.1', port: 3001 })
  })

  it('reads host and port overrides', () => {
    const c = loadConfig({ MANAGER_SECRET: secret, MANAGER_HOST: '0.0.0.0', MANAGER_PORT: '4000' })
    expect(c).toMatchObject({ host: '0.0.0.0', port: 4000 })
  })
})
