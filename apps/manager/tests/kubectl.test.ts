import type { execFile, spawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import { createKubectl, KubectlError } from '../src/kube/kubectl.js'

const base = { MANAGER_SECRET: 's'.repeat(32) }
const cfg = (extra: NodeJS.ProcessEnv = {}) => loadConfig({ ...base, ...extra })

type Cb = (err: unknown, stdout: string, stderr: string) => void
interface Call {
  file: string
  args: string[]
  options: { env?: NodeJS.ProcessEnv }
  child: { stdin: { end: ReturnType<typeof vi.fn> }; kill: ReturnType<typeof vi.fn> }
}

/** Fake execFile: `reply` decides how each call ends; return nothing to hang (for timeouts). */
function fakeExec(reply?: (args: string[]) => { err?: unknown; stdout?: string; stderr?: string } | void) {
  const calls: Call[] = []
  const impl = ((file: string, args: string[], options: Call['options'], cb: Cb) => {
    const child = { stdin: { end: vi.fn() }, kill: vi.fn() }
    calls.push({ file, args, options, child })
    const r = reply?.(args)
    if (r) queueMicrotask(() => cb(r.err ?? null, r.stdout ?? '', r.stderr ?? ''))
    return child
  }) as unknown as typeof execFile
  return { impl, calls }
}

const exitErr = (code = 1) => Object.assign(new Error('Command failed'), { code })
const ok = () => ({ stdout: 'out' })

describe('createKubectl().run', () => {
  it('runs the configured binary with args as an array, prefixed with context and namespace', async () => {
    const { impl, calls } = fakeExec(ok)
    const k = createKubectl(cfg({ KUBECTL_BIN: '/bin/kc', KUBE_CONTEXT: 'bighaus', MC_NAMESPACE: 'mc' }), impl)
    await expect(k.run(['get', 'pods'])).resolves.toEqual({ stdout: 'out', stderr: '', code: 0 })
    expect(calls[0]!.file).toBe('/bin/kc')
    expect(calls[0]!.args).toEqual(['--context', 'bighaus', '--namespace', 'mc', 'get', 'pods'])
  })

  it('omits --context when not configured and honours namespace: null', async () => {
    const { impl, calls } = fakeExec(ok)
    await createKubectl(cfg(), impl).run(['version'], { namespace: null })
    expect(calls[0]!.args).toEqual(['version'])
  })

  it('keeps a hostile value as one single argument (no shell)', async () => {
    const { impl, calls } = fakeExec(ok)
    await createKubectl(cfg(), impl).run(['get', 'pods', '-l', 'a; rm -rf /'])
    expect(calls[0]!.args.slice(-4)).toEqual(['get', 'pods', '-l', 'a; rm -rf /'])
    expect(calls[0]!.args.filter((a) => a.includes('rm -rf'))).toEqual(['a; rm -rf /'])
  })

  it('sets KUBECONFIG only when configured', async () => {
    const { impl, calls } = fakeExec(ok)
    await createKubectl(cfg(), impl).run(['get', 'pods'])
    await createKubectl(cfg({ KUBECONFIG: '/etc/kc' }), impl).run(['get', 'pods'])
    expect(calls[0]!.options.env).toBeUndefined()
    expect(calls[1]!.options.env?.KUBECONFIG).toBe('/etc/kc')
  })

  it('writes stdin to the child', async () => {
    const { impl, calls } = fakeExec(ok)
    await createKubectl(cfg(), impl).run(['apply', '-f', '-'], { stdin: 'kind: Service' })
    expect(calls[0]!.child.stdin.end).toHaveBeenCalledWith('kind: Service')
  })

  it('kills the process and rejects with code timeout', async () => {
    const { impl, calls } = fakeExec()
    const p = createKubectl(cfg(), impl).run(['get', 'pods'], { timeoutMs: 20 })
    await expect(p).rejects.toMatchObject({ name: 'KubectlError', code: 'timeout' })
    expect(calls[0]!.child.kill).toHaveBeenCalled()
  })

  describe('error mapping', () => {
    const fail = (stderr: string) => createKubectl(cfg(), fakeExec(() => ({ err: exitErr(), stderr })).impl).run(['get', 'pods'])

    it.each([
      ['The connection to the server localhost:8080 was refused - connection refused', 'unreachable'],
      ['Unable to connect to the server: dial tcp 10.0.0.1:6443: i/o timeout', 'unreachable'],
      ['Error from server (Forbidden): pods is forbidden: User "x" cannot list resource', 'forbidden'],
      ['Error from server (NotFound): deployments.apps "x" not found', 'notfound'],
      ['Error from server (Conflict): the object has been modified', 'conflict'],
      ['Error from server (AlreadyExists): services "x" already exists', 'conflict'],
      ['something odd', 'failed'],
    ])('%s -> %s', async (stderr, code) => {
      const err = await fail(stderr).catch((e) => e)
      expect(err).toBeInstanceOf(KubectlError)
      expect(err.code).toBe(code)
    })

    it('does not leak stderr in the message for unreachable/forbidden', async () => {
      const secret = 'token=abc123 /home/me/.kube/config'
      for (const prefix of ['Unable to connect to the server: ', 'Error from server (Forbidden): ']) {
        const err = await fail(prefix + secret).catch((e) => e)
        expect(err.message).not.toContain('abc123')
        expect(err.message).not.toContain('.kube')
        expect(err.message.length).toBeLessThan(100)
        expect(JSON.stringify(err)).not.toContain('abc123')
      }
    })

    it('maps a missing binary to unreachable', async () => {
      const { impl } = fakeExec(() => ({ err: Object.assign(new Error('spawn kubectl ENOENT'), { code: 'ENOENT' }) }))
      await expect(createKubectl(cfg(), impl).run(['get', 'pods'])).rejects.toMatchObject({ code: 'unreachable' })
    })

    it('exposes stdout (e.g. `auth can-i` answering no) on the error', async () => {
      const { impl } = fakeExec(() => ({ err: exitErr(), stdout: 'no\n' }))
      const err = await createKubectl(cfg(), impl).run(['auth', 'can-i', 'get', 'pods']).catch((e) => e)
      expect(err.stdout).toBe('no\n')
    })
  })
})

describe('guard (SC-009, FR-002)', () => {
  const refused = async (args: string[], opts?: Parameters<ReturnType<typeof createKubectl>['run']>[1]) => {
    const { impl, calls } = fakeExec(ok)
    const err = await createKubectl(cfg(), impl).run(args, opts).catch((e) => e)
    expect(err).toBeInstanceOf(KubectlError)
    expect(err.code).toBe('refused')
    expect(calls).toHaveLength(0)
  }
  const allowed = async (args: string[], opts?: Parameters<ReturnType<typeof createKubectl>['run']>[1]) => {
    const { impl, calls } = fakeExec(ok)
    await createKubectl(cfg(), impl).run(args, opts)
    expect(calls).toHaveLength(1)
  }

  it.each([
    [['get', 'pods', '-n', 'default']],
    [['get', 'pods', '--namespace', 'default']],
    [['get', 'pods', '--namespace=default']],
    [['get', 'pods', '-ndefault']],
    [['get', 'pods', '-n', 'kube-system']],
    [['get', 'pods', '--all-namespaces']],
    [['get', 'pods', '-A']],
    [['get', 'services', '--context', 'other']],
    [['get', 'services', '--kubeconfig=/tmp/x']],
  ])('refuses %j', async (args) => refused(args))

  it('refuses a namespace other than the configured one given as an option', async () => {
    await refused(['get', 'pods'], { namespace: 'default' })
  })

  it('refuses namespaced resources with no namespace at all', async () => {
    await refused(['get', 'pods'], { namespace: null })
  })

  it.each([
    [['get', 'secrets']],
    [['get', 'nodes']],
    [['get', 'deployments,secrets']],
    [['delete', 'secret/x']],
    [['get', 'all']],
    [['rollout', 'status', 'statefulset/x']],
    [['auth', 'can-i', 'get', 'secrets']],
    [['config', 'view']],
    [['logs', 'secret/x']],
    [['cp', 'default/pod:/data', './out']],
  ])('refuses resource in %j', async (args) => refused(args))

  it.each([
    [['get', 'deployments', '-o', 'json']],
    [['get', 'deployment/bedrock-a']],
    [['get', 'pods,services,persistentvolumeclaims,ingressrouteudps.traefik.io,jobs.batch']],
    [['rollout', 'status', 'deployment/bedrock-a']],
    [['logs', 'bedrock-a-123']],
    [['exec', 'bedrock-a-123', '--', 'send-command', 'get', 'secrets']],
    [['auth', 'can-i', 'patch', 'deployments', '--subresource=scale']],
    [['get', 'pods', '-n', 'minecraft-servers']],
    [['apply', '-f', '-']],
  ])('allows %j', async (args) => allowed(args))

  describe('kube-system exception', () => {
    const ks = { namespace: 'kube-system' }
    const manifest = JSON.stringify({ kind: 'HelmChartConfig', metadata: { name: 'traefik' } })

    it.each([
      [['get', 'helmchartconfig', 'traefik', '-o', 'json']],
      [['get', 'helmchartconfigs.helm.cattle.io', 'traefik']],
      [['get', 'helmchartconfig/traefik']],
      [['auth', 'can-i', 'patch', 'helmchartconfigs.helm.cattle.io/traefik']],
    ])('allows %j', async (args) => allowed(args, ks))

    it('allows replace/apply of a HelmChartConfig manifest on stdin', async () => {
      await allowed(['replace', '-f', '-'], { ...ks, stdin: manifest })
      await allowed(['apply', '-f', '-'], { ...ks, stdin: manifest })
    })

    it.each([
      [['get', 'helmchartconfigs']],
      [['get', 'helmchartconfig', 'other']],
      [['get', 'pods']],
      [['get', 'secrets']],
      [['delete', 'helmchartconfig', 'traefik']],
      [['patch', 'helmchartconfig', 'traefik']],
    ])('refuses %j in kube-system', async (args) => refused(args, ks))

    it('refuses apply in kube-system without a HelmChartConfig-only manifest', async () => {
      await refused(['apply', '-f', '-'], ks)
      await refused(['apply', '-f', '-'], { ...ks, stdin: JSON.stringify({ kind: 'Secret' }) })
      await refused(['apply', '-f', '-'], { ...ks, stdin: manifest + JSON.stringify({ kind: 'Secret' }) })
    })

    it('refuses an explicit -n kube-system outside the exception', async () => {
      await refused(['get', 'pods', '-n', 'kube-system'], ks)
    })
  })
})

describe('createKubectl().spawn', () => {
  const fakeSpawn = () => {
    const calls: { file: string; args: string[]; options: { env?: NodeJS.ProcessEnv } }[] = []
    const child = { stdin: { end: vi.fn() } }
    const impl = ((file: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
      calls.push({ file, args, options })
      return child
    }) as unknown as typeof spawn
    return { impl, calls, child }
  }

  it('uses the same prefixing, env and no shell', () => {
    const s = fakeSpawn()
    const k = createKubectl(cfg({ KUBE_CONTEXT: 'c', KUBECONFIG: '/kc' }), fakeExec().impl, s.impl)
    expect(k.spawn(['logs', '-f', 'bedrock-a-1'])).toBe(s.child)
    expect(s.calls[0]!.args).toEqual(['--context', 'c', '--namespace', 'minecraft-servers', 'logs', '-f', 'bedrock-a-1'])
    expect(s.calls[0]!.options.env?.KUBECONFIG).toBe('/kc')
    expect(s.calls[0]!.options).not.toHaveProperty('shell')
  })

  it('applies the same guard, throwing before spawning', () => {
    const s = fakeSpawn()
    const k = createKubectl(cfg(), fakeExec().impl, s.impl)
    expect(() => k.spawn(['logs', '-f', 'x', '-n', 'default'])).toThrowError(KubectlError)
    expect(() => k.spawn(['get', 'secrets'])).toThrowError(expect.objectContaining({ code: 'refused' }))
    expect(s.calls).toHaveLength(0)
  })
})
