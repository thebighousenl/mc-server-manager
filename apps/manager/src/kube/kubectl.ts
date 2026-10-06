import { execFile, spawn, type ChildProcess } from 'node:child_process'
import type { Config } from '../config.js'

export type KubectlErrorCode = 'timeout' | 'unreachable' | 'forbidden' | 'notfound' | 'conflict' | 'refused' | 'failed'

const MESSAGES: Record<KubectlErrorCode, string> = {
  timeout: 'kubectl timed out',
  unreachable: 'cluster unreachable',
  forbidden: 'permission denied by the cluster',
  notfound: 'object not found',
  conflict: 'object changed, reload and retry',
  refused: 'refused by the kubectl guard',
  failed: 'kubectl failed',
}

// The message is a fixed text on purpose: stderr can carry tokens or kubeconfig content.
export class KubectlError extends Error {
  constructor(readonly code: KubectlErrorCode, message = MESSAGES[code]) {
    super(message)
  }
}

export interface RunOpts { stdin?: string, timeoutMs?: number, namespace?: string | null }
export interface Kubectl {
  run(args: string[], opts?: RunOpts): Promise<{ stdout: string, stderr: string, code: number }>
  spawn(args: string[], opts?: RunOpts): ChildProcess
}

const KINDS = new Set([
  'deployments', 'deployment', 'deploy', 'pods', 'pod', 'po', 'services', 'service', 'svc',
  'persistentvolumeclaims', 'persistentvolumeclaim', 'pvc', 'ingressrouteudps', 'ingressrouteudp',
  'jobs', 'job', 'helmchartconfigs', 'helmchartconfig',
])
const VALUE_FLAGS = new Set([
  '-n', '--namespace', '--context', '-o', '--output', '-l', '--selector', '-f', '--filename', '--tail', '--replicas',
  '--type', '-p', '--patch', '--resource-name', '--as', '--timeout', '--for', '-c', '--container', '--since',
])
// Index of the resource among the positionals (verb is 0).
const RESOURCE_AT: Record<string, number> = { rollout: 2, auth: 3 }

function guard(args: string[], namespace: string, opts: RunOpts | undefined) {
  const refuse = () => new KubectlError('refused')
  const positional: string[] = []
  const flagNs: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--') break
    if (a === '-A' || a === '--all-namespaces') throw refuse()
    if (a === '-n' || a === '--namespace') flagNs.push(args[++i] ?? '')
    else if (a.startsWith('--namespace=')) flagNs.push(a.slice(12))
    else if (a.startsWith('-n') && !a.startsWith('--')) flagNs.push(a.slice(2))
    else if (VALUE_FLAGS.has(a)) i++
    else if (!a.startsWith('-')) positional.push(a)
  }
  const verb = positional[0]
  const resources = (positional[RESOURCE_AT[verb ?? ''] ?? 1] ?? '').split(',').filter(Boolean)
  const isTraefikConfig = resources.length === 1 && /^helmchartconfigs?(\.helm\.cattle\.io)?(\/traefik)?$/.test(resources[0]!)
    && (positional.includes('traefik') || resources[0]!.endsWith('/traefik') || verb === 'auth')
    && ['get', 'replace', 'apply', 'auth'].includes(verb ?? '')
  const namespaces = flagNs.length ? flagNs : [opts?.namespace === undefined ? namespace : (opts.namespace ?? '')]
  for (const ns of namespaces) {
    if (ns !== namespace && !(ns === 'kube-system' && isTraefikConfig)) throw refuse()
  }
  for (const r of resources) {
    const kind = r.split('/')[0]!.split('.')[0]!
    if (!KINDS.has(kind)) throw refuse()
  }
  return flagNs.length === 0 && opts?.namespace !== null
}

export function createKubectl(config: Config, execFileImpl: typeof execFile = execFile, spawnImpl: typeof spawn = spawn): Kubectl {
  const { bin, context, kubeconfig, namespace } = config.kube
  const env = kubeconfig ? { ...process.env, KUBECONFIG: kubeconfig } : undefined
  const prepare = (args: string[], opts?: RunOpts) => {
    const addNs = guard(args, namespace, opts)
    return [
      ...(context ? ['--context', context] : []),
      ...(addNs ? ['--namespace', opts?.namespace ?? namespace] : []),
      ...args,
    ]
  }
  const classify = (stderr: string): KubectlErrorCode => {
    if (/connection refused|unable to connect|couldn't get current server|no such host|i\/o timeout|dial tcp/i.test(stderr)) return 'unreachable'
    if (/forbidden/i.test(stderr)) return 'forbidden'
    if (/notfound|not found/i.test(stderr)) return 'notfound'
    if (/conflict|the object has been modified/i.test(stderr)) return 'conflict'
    return 'failed'
  }
  return {
    run(args, opts) {
      return new Promise((resolve, reject) => {
        const full = prepare(args, opts)
        const child = execFileImpl(bin, full, { env, timeout: opts?.timeoutMs ?? 30_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (!err) return resolve({ stdout, stderr, code: 0 })
          const e = err as NodeJS.ErrnoException & { killed?: boolean }
          if (e.killed) return reject(new KubectlError('timeout'))
          // A non-zero exit without stderr is an answer, not a failure (`auth can-i` prints "no" and exits 1).
          if (typeof e.code === 'number' && !stderr) return resolve({ stdout, stderr, code: e.code })
          reject(new KubectlError(classify(stderr)))
        })
        child.stdin?.end(opts?.stdin ?? '')
      })
    },
    spawn(args, opts) {
      return spawnImpl(bin, prepare(args, opts), { env })
    },
  }
}
