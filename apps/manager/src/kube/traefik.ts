import { parse, stringify } from 'yaml'
import type { Kubectl } from './kubectl.js'
import { KubectlError } from './kubectl.js'
import { TRAEFIK_LOCK, withLock } from '../servers/lock.js'
import { PROTECTED_NAMES } from '../servers/protect.js'

export { readTraefikPorts } from './traefik-read.js'

export interface PortEntry { port: number, exposedPort: number, protocol: string, expose: { default: boolean } }
export interface TraefikValues { ports: Record<string, PortEntry> }

export class TraefikError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const usedPorts = (v: TraefikValues) => Object.values(v.ports).map(p => p.exposedPort)

export function addPort(values: TraefikValues, name: string, port: number): TraefikValues {
  if (`mc-${name}` in values.ports) throw new TraefikError(409, `entrypoint mc-${name} already exists`)
  if (usedPorts(values).includes(port)) throw new TraefikError(409, `port ${port} is already in use`)
  return { ...values, ports: { ...values.ports, [`mc-${name}`]: { port, exposedPort: port, protocol: 'UDP', expose: { default: true } } } }
}

export function removePort(values: TraefikValues, name: string): TraefikValues {
  if (PROTECTED_NAMES.includes(name)) throw new TraefikError(403, `${name} is protected`)
  if (!(`mc-${name}` in values.ports)) throw new TraefikError(404, `entrypoint mc-${name} does not exist`)
  return { ...values, ports: Object.fromEntries(Object.entries(values.ports).filter(([k]) => k !== `mc-${name}`)) }
}

export function nextFreePort(values: TraefikValues, min: number, max: number): number {
  const used = new Set(usedPorts(values))
  for (let p = min; p <= max; p++) if (!used.has(p)) return p
  throw new TraefikError(409, 'no free port in the configured range')
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The shared edit: at most one mc- entry added or removed, nothing else touched, dry run before the write.
export function applyTraefik(kubectl: Kubectl, mutate: (v: TraefikValues) => TraefikValues): Promise<TraefikValues> {
  return withLock(TRAEFIK_LOCK, async () => {
    const ref = ['helmchartconfig', 'traefik', '-n', 'kube-system']
    const obj = JSON.parse((await kubectl.run(['get', ...ref, '-o', 'json'])).stdout)
    const before = (parse(obj.spec?.valuesContent ?? '') ?? { ports: {} }) as TraefikValues
    before.ports ??= {}
    const after = mutate(structuredClone(before))
    const changed = [...new Set([...Object.keys(before.ports), ...Object.keys(after.ports)])]
      .filter(k => !same(before.ports[k], after.ports[k]))
    if (changed.length > 1 || changed.some(k => !k.startsWith('mc-') || (k in before.ports && k in after.ports)) || !same({ ...before, ports: 0 }, { ...after, ports: 0 })) {
      throw new TraefikError(409, 'refusing to change Traefik entries other than the target')
    }
    if (changed.some(k => !(k in after.ports) && PROTECTED_NAMES.includes(k.slice(3)))) {
      throw new TraefikError(403, 'refusing to remove a protected server entry')
    }
    const stdin = JSON.stringify({ ...obj, spec: { ...obj.spec, valuesContent: stringify(after) } })
    await kubectl.run(['apply', '-f', '-', ...ref.slice(2), '--dry-run=server'], { stdin }) // fails before any write
    try {
      await kubectl.run(['replace', '-f', '-', ...ref.slice(2)], { stdin }) // carries the read resourceVersion
    }
    catch (err) {
      if (err instanceof KubectlError && err.code === 'conflict') throw new TraefikError(409, 'Traefik config changed meanwhile: retry')
      throw err
    }
    return after
  })
}
