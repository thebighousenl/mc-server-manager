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
    expect(loadConfig({ MANAGER_SECRET: secret })).toMatchObject({ secret, host: '127.0.0.1', port: 3001 })
  })

  it('reads host and port overrides', () => {
    const c = loadConfig({ MANAGER_SECRET: secret, MANAGER_HOST: '0.0.0.0', MANAGER_PORT: '4000' })
    expect(c).toMatchObject({ host: '0.0.0.0', port: 4000 })
  })
})

describe('loadConfig cluster settings', () => {
  const load = (env: Record<string, string> = {}) => loadConfig({ MANAGER_SECRET: secret, ...env })

  it('has defaults', () => {
    const c = load()
    expect(c.kube).toEqual({ namespace: 'minecraft-servers', context: undefined, kubeconfig: undefined, bin: 'kubectl' })
    expect(c.ports).toEqual({ min: 19132, max: 19999 })
    expect(c.pollMs).toBe(3000)
    expect(c.exports).toEqual({ size: '20Gi', storageClass: 'local-path' })
    expect(c.publicHost).toBe('127.0.0.1')
  })

  it('passes overrides through', () => {
    const c = load({
      MC_NAMESPACE: 'mc', KUBE_CONTEXT: 'ctx', KUBECONFIG: '/k', KUBECTL_BIN: '/bin/k',
      MC_PORT_MIN: '20000', MC_PORT_MAX: '20010', MC_POLL_MS: '500', MC_EXPORTS_SIZE: '1500Mi', MC_EXPORTS_STORAGE_CLASS: 'fast', MC_PUBLIC_HOST: 'mc.example.org',
    })
    expect(c.kube).toEqual({ namespace: 'mc', context: 'ctx', kubeconfig: '/k', bin: '/bin/k' })
    expect(c.ports).toEqual({ min: 20000, max: 20010 })
    expect(c.pollMs).toBe(500)
    expect(c.exports).toEqual({ size: '1500Mi', storageClass: 'fast' })
    expect(c.publicHost).toBe('mc.example.org')
  })

  it.each([
    ['MC_NAMESPACE', 'Bad_NS'],
    ['MC_NAMESPACE', '-x'],
    ['MC_PORT_MIN', '0'],
    ['MC_PORT_MAX', '70000'],
    ['MC_PORT_MIN', 'abc'],
    ['MC_POLL_MS', '499'],
    ['MC_EXPORTS_SIZE', 'lots'],
  ])('rejects %s=%s naming the variable', (key, value) => {
    expect(() => load({ [key]: value })).toThrow(new RegExp(key))
  })

  it('rejects min > max', () => {
    expect(() => load({ MC_PORT_MIN: '20000', MC_PORT_MAX: '19999' })).toThrow(/MC_PORT_MIN/)
  })
})
