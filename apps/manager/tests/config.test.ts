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

  describe('cluster access', () => {
    const load = (extra: NodeJS.ProcessEnv = {}) => loadConfig({ MANAGER_SECRET: secret, ...extra })

    it('has defaults', () => {
      const c = load()
      expect(c.kube).toEqual({
        namespace: 'minecraft-servers',
        context: undefined,
        kubeconfig: undefined,
        bin: 'kubectl',
        pollMs: 3000,
        exportsSize: '20Gi',
        exportsStorageClass: 'local-path',
      })
      expect(c.ports).toEqual({ min: 19132, max: 19999 })
    })

    it('reads overrides and passes context/kubeconfig through', () => {
      const c = load({
        MC_NAMESPACE: 'mc-test',
        KUBE_CONTEXT: 'bighaus',
        KUBECONFIG: '/etc/kube/config',
        KUBECTL_BIN: '/usr/local/bin/kubectl',
        MC_PORT_MIN: '20000',
        MC_PORT_MAX: '20010',
        MC_POLL_MS: '500',
        MC_EXPORTS_SIZE: '1.5Ti',
        MC_EXPORTS_STORAGE_CLASS: 'fast',
      })
      expect(c.kube).toEqual({
        namespace: 'mc-test',
        context: 'bighaus',
        kubeconfig: '/etc/kube/config',
        bin: '/usr/local/bin/kubectl',
        pollMs: 500,
        exportsSize: '1.5Ti',
        exportsStorageClass: 'fast',
      })
      expect(c.ports).toEqual({ min: 20000, max: 20010 })
    })

    it('treats empty optional variables as unset', () => {
      const c = load({ KUBE_CONTEXT: '', KUBECONFIG: '', KUBECTL_BIN: '' })
      expect(c.kube).toMatchObject({ context: undefined, kubeconfig: undefined, bin: 'kubectl' })
    })

    it.each([
      ['MC_NAMESPACE', 'Not_Valid'],
      ['MC_NAMESPACE', '-lead'],
      ['MC_NAMESPACE', 'a'.repeat(64)],
      ['MC_PORT_MIN', '0'],
      ['MC_PORT_MIN', '70000'],
      ['MC_PORT_MIN', 'abc'],
      ['MC_PORT_MAX', '1.5'],
      ['MC_POLL_MS', '499'],
      ['MC_POLL_MS', 'soon'],
      ['MC_EXPORTS_SIZE', 'lots'],
      ['MC_EXPORTS_SIZE', '20 Gi'],
    ])('throws naming %s for %s', (name, value) => {
      expect(() => load({ [name]: value })).toThrow(new RegExp(name))
    })

    it('throws when MC_PORT_MIN > MC_PORT_MAX', () => {
      expect(() => load({ MC_PORT_MIN: '20000', MC_PORT_MAX: '19000' })).toThrow(/MC_PORT_MIN/)
    })

    it('accepts MC_PORT_MIN == MC_PORT_MAX', () => {
      expect(load({ MC_PORT_MIN: '19132', MC_PORT_MAX: '19132' }).ports).toEqual({ min: 19132, max: 19132 })
    })
  })
})
