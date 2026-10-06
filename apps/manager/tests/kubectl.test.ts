import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { createKubectl, KubectlError } from '../src/kube/kubectl.js'

const secret = 's'.repeat(32)
const cfg = (env: Record<string, string> = {}) => loadConfig({ MANAGER_SECRET: secret, ...env })

type Cb = (err: unknown, stdout: string, stderr: string) => void
interface Call { file: string, args: string[], opts: { env?: NodeJS.ProcessEnv, timeout?: number }, stdin: string[] }

// A fake execFile: `reply` decides the callback arguments.
function fakeExec(reply: () => { err?: unknown, stdout?: string, stderr?: string } = () => ({})) {
  const calls: Call[] = []
  const impl = ((file: string, args: string[], opts: Call['opts'], cb: Cb) => {
    const call: Call = { file, args, opts, stdin: [] }
    calls.push(call)
    const r = reply()
    queueMicrotask(() => cb(r.err ?? null, r.stdout ?? '', r.stderr ?? ''))
    return { stdin: { end: (s: string) => call.stdin.push(s) } }
  }) as never
  return { calls, impl }
}

const failWith = (stderr: string, code = 1) => () => ({ err: Object.assign(new Error('x'), { code }), stderr })

describe('createKubectl', () => {
  it('passes args as an array, never a shell string', async () => {
    const f = fakeExec()
    await createKubectl(cfg(), f.impl).run(['get', 'pods', 'a; rm -rf /'])
    expect(f.calls[0]!.file).toBe('kubectl')
    expect(f.calls[0]!.args).toEqual(['--namespace', 'minecraft-servers', 'get', 'pods', 'a; rm -rf /'])
  })

  it('prepends context and namespace from config, uses KUBECTL_BIN', async () => {
    const f = fakeExec()
    await createKubectl(cfg({ KUBE_CONTEXT: 'ctx', MC_NAMESPACE: 'mc', KUBECTL_BIN: '/bin/k' }), f.impl).run(['get', 'pods'])
    expect(f.calls[0]!.file).toBe('/bin/k')
    expect(f.calls[0]!.args).toEqual(['--context', 'ctx', '--namespace', 'mc', 'get', 'pods'])
  })

  it('sets KUBECONFIG only when configured', async () => {
    const f = fakeExec()
    await createKubectl(cfg(), f.impl).run(['get', 'pods'])
    expect(f.calls[0]!.opts.env).toBeUndefined()
    await createKubectl(cfg({ KUBECONFIG: '/k' }), f.impl).run(['get', 'pods'])
    expect(f.calls[1]!.opts.env?.KUBECONFIG).toBe('/k')
  })

  it('returns stdout, writes stdin', async () => {
    const f = fakeExec(() => ({ stdout: 'out' }))
    const r = await createKubectl(cfg(), f.impl).run(['apply', '-f', '-'], { stdin: 'yaml' })
    expect(r).toEqual({ stdout: 'out', stderr: '', code: 0 })
    expect(f.calls[0]!.stdin).toEqual(['yaml'])
  })

  it('returns a non-zero exit with empty stderr as a result (auth can-i no)', async () => {
    const f = fakeExec(() => ({ err: Object.assign(new Error('x'), { code: 1 }), stdout: 'no' }))
    expect(await createKubectl(cfg(), f.impl).run(['auth', 'can-i', 'get', 'pods'])).toEqual({ stdout: 'no', stderr: '', code: 1 })
  })

  it('timeout rejects with code timeout and passes the timeout to execFile', async () => {
    const f = fakeExec(() => ({ err: Object.assign(new Error('x'), { killed: true, signal: 'SIGTERM' }) }))
    await expect(createKubectl(cfg(), f.impl).run(['get', 'pods'], { timeoutMs: 50 })).rejects.toMatchObject({ code: 'timeout' })
    expect(f.calls[0]!.opts.timeout).toBe(50)
  })

  it.each([
    ['The connection to the server localhost:8080 was refused - did you specify the right host or port? connection refused', 'unreachable'],
    ['Unable to connect to the server: dial tcp 1.2.3.4:6443: i/o timeout', 'unreachable'],
    ['Error from server (Forbidden): pods is forbidden: User "x" token abc123', 'forbidden'],
    ['Error from server (NotFound): deployments.apps "x" not found', 'notfound'],
    ['Error from server (Conflict): the object has been modified', 'conflict'],
    ['something else', 'failed'],
  ])('maps stderr %j to %s', async (stderr, code) => {
    const f = fakeExec(failWith(stderr))
    const err = await createKubectl(cfg(), f.impl).run(['get', 'pods']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KubectlError)
    expect((err as KubectlError).code).toBe(code)
  })

  it('never puts stderr in the message of unreachable/forbidden errors', async () => {
    for (const stderr of ['connection refused token=SECRET', 'forbidden token=SECRET']) {
      const err = await createKubectl(cfg(), fakeExec(failWith(stderr)).impl).run(['get', 'pods']).catch((e: unknown) => e)
      expect((err as Error).message).not.toContain('SECRET')
      expect((err as Error).message.length).toBeLessThan(60)
    }
  })
})

describe('namespace and resource guard', () => {
  const refused = async (args: string[], opts?: { namespace?: string | null }) => {
    const f = fakeExec()
    await expect(createKubectl(cfg(), f.impl).run(args, opts)).rejects.toMatchObject({ code: 'refused' })
    expect(f.calls).toHaveLength(0)
  }
  const allowed = async (args: string[], opts?: { namespace?: string | null }) => {
    const f = fakeExec()
    await createKubectl(cfg(), f.impl).run(args, opts)
    expect(f.calls).toHaveLength(1)
  }

  it.each([
    [['get', 'pods', '-n', 'default']],
    [['get', 'pods', '--namespace', 'default']],
    [['get', 'pods', '--namespace=default']],
    [['get', 'pods', '-ndefault']],
    [['get', 'pods', '-A']],
    [['get', 'pods', '--all-namespaces']],
    [['get', 'secrets']],
    [['get', 'nodes']],
    [['delete', 'namespace/x']],
    [['get', 'deploy,secrets']],
    [['auth', 'can-i', 'get', 'secrets']],
    [['rollout', 'restart', 'statefulset/x']],
  ])('refuses %j', async (args) => refused(args))

  it('refuses another namespace through opts', async () => {
    await refused(['get', 'pods'], { namespace: 'default' })
  })

  it('kube-system only for the single traefik helmchartconfig', async () => {
    await allowed(['get', 'helmchartconfig', 'traefik', '-o', 'json'], { namespace: 'kube-system' })
    await allowed(['get', 'helmchartconfig', 'traefik', '-n', 'kube-system'])
    await refused(['get', 'helmchartconfig', 'other'], { namespace: 'kube-system' })
    await refused(['get', 'pods'], { namespace: 'kube-system' })
    await refused(['delete', 'helmchartconfig', 'traefik'], { namespace: 'kube-system' })
  })

  it.each([
    [['get', 'deploy,pods', '-l', 'a=b']],
    [['get', 'deployments', 'bedrock-daan']],
    [['scale', 'deploy/bedrock-daan', '--replicas=0']],
    [['rollout', 'restart', 'deploy/bedrock-daan']],
    [['get', 'ingressrouteudps.traefik.io']],
    [['get', 'jobs.batch']],
    [['logs', 'deploy/bedrock-daan', '--tail', '10']],
    [['exec', 'deploy/bedrock-daan', '--', 'send-command', 'say', 'secrets']],
    [['auth', 'can-i', 'create', 'pods/exec']],
    [['apply', '-f', '-']],
  ])('allows %j', async (args) => allowed(args))

  it('spawn uses the same guard and prefixing', () => {
    const spawned: string[][] = []
    const k = createKubectl(cfg(), fakeExec().impl, ((_f: string, a: string[]) => (spawned.push(a), {})) as never)
    k.spawn(['logs', '-f', 'deploy/bedrock-daan'])
    expect(spawned[0]).toEqual(['--namespace', 'minecraft-servers', 'logs', '-f', 'deploy/bedrock-daan'])
    expect(() => k.spawn(['get', 'secrets'])).toThrow(KubectlError)
    expect(() => k.spawn(['logs', '-A'])).toThrow(KubectlError)
  })
})
