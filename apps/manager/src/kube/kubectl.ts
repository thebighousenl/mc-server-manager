import { execFile, spawn, type ChildProcess, type ExecFileException } from 'node:child_process'
import type { Config } from '../config.js'

export type KubectlErrorCode =
  | 'unreachable'
  | 'forbidden'
  | 'notfound'
  | 'conflict'
  | 'timeout'
  | 'refused'
  | 'failed'

const MESSAGES: Record<KubectlErrorCode, string> = {
  unreachable: 'cluster is unreachable',
  forbidden: 'permission denied by the cluster',
  notfound: 'resource not found',
  conflict: 'resource conflict',
  timeout: 'kubectl timed out',
  refused: 'kubectl call refused',
  failed: 'kubectl failed',
}

export class KubectlError extends Error {
  readonly stdout!: string
  readonly stderr!: string
  constructor(
    readonly code: KubectlErrorCode,
    detail?: string,
    output: { stdout?: string; stderr?: string } = {},
  ) {
    super(detail ? `${MESSAGES[code]}: ${detail}` : MESSAGES[code])
    this.name = 'KubectlError'
    // Raw output stays off the message and out of JSON/log serialisation: it can hold tokens or paths.
    Object.defineProperty(this, 'stdout', { value: output.stdout ?? '', enumerable: false })
    Object.defineProperty(this, 'stderr', { value: output.stderr ?? '', enumerable: false })
  }
}

export interface KubectlOptions {
  stdin?: string
  timeoutMs?: number
  /** Namespace flag to prepend: undefined = configured namespace, null = none. */
  namespace?: string | null
}

export interface Kubectl {
  run(args: string[], opts?: KubectlOptions): Promise<{ stdout: string; stderr: string; code: number }>
  /** For long-lived streams (logs, downloads). Same prefixing and guard as `run`. */
  spawn(args: string[], opts?: KubectlOptions): ChildProcess
}

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_BUFFER = 64 * 1024 * 1024

const ALLOWED_KINDS = new Set(
  ['deployment', 'pod', 'service', 'persistentvolumeclaim', 'ingressrouteudp', 'job', 'helmchartconfig'].flatMap((k) => [k, `${k}s`]),
)
// Flags whose value is a separate argument, so it is not mistaken for a resource.
const VALUE_FLAGS = new Set([
  '-n', '--namespace', '-o', '--output', '-l', '--selector', '-f', '--filename', '-c', '--container',
  '--tail', '-p', '--patch', '--type', '--for', '--timeout', '-L', '--field-selector', '--since',
  '--from', '--image', '--subresource', '--sort-by', '--request-timeout',
])
const FORBIDDEN_FLAG = /^--(context|kubeconfig|server|token|as|as-group|user|cluster)(=|$)/
const KUBE_SYSTEM = 'kube-system'

function refuse(reason: string): never {
  throw new KubectlError('refused', reason)
}

function parse(args: string[]) {
  const end = args.indexOf('--')
  const own = end === -1 ? args : args.slice(0, end)
  const positional: string[] = []
  const namespaces: string[] = []
  for (let i = 0; i < own.length; i++) {
    const a = own[i]!
    if (a === '-A' || a.startsWith('--all-namespaces')) refuse('all namespaces is not allowed')
    if (FORBIDDEN_FLAG.test(a)) refuse(`${a.split('=')[0]} is not allowed`)
    if (a === '-n' || a === '--namespace') namespaces.push(own[++i] ?? '')
    else if (a.startsWith('--namespace=')) namespaces.push(a.slice(12))
    else if (/^-n./.test(a) && !a.startsWith('--')) namespaces.push(a.slice(2))
    else if (VALUE_FLAGS.has(a)) i++
    else if (!a.startsWith('-')) positional.push(a)
  }
  return { positional, namespaces }
}

/** Kind (and name) the command acts on, from the positional arguments. */
function target(pos: string[]): { kinds: string[]; name?: string } {
  const [verb] = pos
  let ref: string | undefined
  let nameFrom: string | undefined
  if (verb === 'auth') ref = pos[3]
  else if (verb === 'rollout') {
    ref = pos[2]
    nameFrom = pos[3]
  }
  else if (verb === 'logs' || verb === 'exec' || verb === 'attach' || verb === 'port-forward') {
    ref = pos[1]?.includes('/') ? pos[1] : undefined // a bare name is a pod
  } else if (verb !== 'cp') {
    ref = pos[1]
    nameFrom = pos[2]
  }
  if (!ref) return { kinds: [] }
  const [kinds, name] = ref.includes('/') ? ref.split('/', 2) : [ref, nameFrom]
  return { kinds: kinds!.split(','), name }
}

const baseKind = (k: string) => k.toLowerCase().split('.')[0]!

function isTraefikConfig(verb: string | undefined, pos: string[], t: ReturnType<typeof target>, stdin?: string) {
  if (verb === 'replace' || verb === 'apply') {
    const kinds = [...(stdin ?? '').matchAll(/"?\bkind"?\s*:\s*"?([A-Za-z]+)/g)].map((m) => m[1])
    return pos.length === 1 && kinds.length > 0 && kinds.every((k) => k === 'HelmChartConfig')
  }
  const readOnly = verb === 'get' || (verb === 'auth' && pos[1] === 'can-i')
  return readOnly && t.kinds.length === 1 && /^helmchartconfigs?$/.test(baseKind(t.kinds[0]!)) && t.name === 'traefik'
}

function guard(args: string[], namespace: string, opts: KubectlOptions) {
  const { positional, namespaces } = parse(args)
  const t = target(positional)
  const named = [...namespaces]
  if (opts.namespace !== null) named.push(opts.namespace ?? namespace)
  for (const ns of named) {
    if (ns === namespace) continue
    if (ns === KUBE_SYSTEM && isTraefikConfig(positional[0], positional, t, opts.stdin)) continue
    refuse(`namespace ${ns} is not allowed`)
  }
  for (const k of t.kinds) {
    if (!ALLOWED_KINDS.has(baseKind(k))) refuse(`resource ${k} is not allowed`)
  }
  if (positional[0] === 'cp') {
    for (const p of positional.slice(1)) {
      const ns = /^([^:/]+)\/[^:]+:/.exec(p)?.[1]
      if (ns && ns !== namespace) refuse(`namespace ${ns} is not allowed`)
    }
  }
  if (!named.length && t.kinds.length) refuse('no namespace given')
}

const UNREACHABLE = /connection refused|unable to connect|no such host|i\/o timeout|dial tcp|handshake timeout|couldn't get current server/i

function classify(err: ExecFileException, stdout: string, stderr: string, verb?: string): KubectlError {
  const output = { stdout, stderr }
  if (err.code === 'ENOENT' || err.code === 'EACCES') return new KubectlError('unreachable', 'kubectl could not be started', output)
  const code: KubectlErrorCode = UNREACHABLE.test(stderr)
    ? 'unreachable'
    : /\(Forbidden\)|forbidden:|unauthorized/i.test(stderr)
      ? 'forbidden'
      : /\(NotFound\)|not found/i.test(stderr)
        ? 'notfound'
        : /\(Conflict\)|\(AlreadyExists\)|already exists|has been modified/i.test(stderr)
          ? 'conflict'
          : 'failed'
  return new KubectlError(code, code === 'failed' ? `${verb ?? 'command'} exited with ${err.code}` : undefined, output)
}

export function createKubectl(
  config: Pick<Config, 'kube'>,
  execFileImpl: typeof execFile = execFile,
  spawnImpl: typeof spawn = spawn,
): Kubectl {
  const { bin, context, kubeconfig, namespace } = config.kube
  const env = kubeconfig ? { ...process.env, KUBECONFIG: kubeconfig } : undefined

  function prepare(args: string[], opts: KubectlOptions) {
    guard(args, namespace, opts)
    const ns = opts.namespace === undefined ? namespace : opts.namespace
    return [...(context ? ['--context', context] : []), ...(ns ? ['--namespace', ns] : []), ...args]
  }

  return {
    run(args, opts = {}) {
      return new Promise((resolve, reject) => {
        const full = prepare(args, opts)
        let settled = false
        const child = execFileImpl(bin, full, { env, encoding: 'utf8', maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
          clearTimeout(timer)
          if (settled) return
          settled = true
          if (err) reject(classify(err, stdout, stderr, args[0]))
          else resolve({ stdout, stderr, code: 0 })
        })
        const timer = setTimeout(() => {
          settled = true
          child.kill()
          reject(new KubectlError('timeout', `${args[0]} after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms`))
        }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        if (opts.stdin !== undefined) child.stdin?.end(opts.stdin)
      })
    },
    spawn(args, opts = {}) {
      const child = spawnImpl(bin, prepare(args, opts), { env })
      if (opts.stdin !== undefined) child.stdin?.end(opts.stdin)
      return child
    },
  }
}
