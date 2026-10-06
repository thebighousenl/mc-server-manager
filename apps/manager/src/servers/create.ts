import type { Kubectl } from '../kube/kubectl.js'
import { generateObjects } from '../kube/generate.js'
import { addPort, applyTraefik, nextFreePort, readTraefikPorts, TraefikError } from '../kube/traefik.js'
import { logAction } from './action-log.js'
import { getServer } from './list.js'
import { withLock } from './lock.js'
import { PROTECTED_NAMES } from './protect.js'
import { validateName, validatePort, validateSettings } from './validate.js'

export class CreateError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface CreateDeps { kubectl: Kubectl, logger: { info: (obj: object, msg?: string) => void }, ports: { min: number, max: number } }
export interface CreateInput { name?: unknown, port?: unknown, settings?: unknown, confirm?: unknown, operator: string }

const DELETE_KIND: Record<string, string> = { PersistentVolumeClaim: 'pvc', Deployment: 'deployment', Service: 'service', IngressRouteUDP: 'ingressrouteudp' }

export function createServer({ kubectl, logger, ports }: CreateDeps, o: CreateInput): Promise<{ server: string, firewall: { port: number, protocol: 'udp' } }> {
  const name = typeof o.name === 'string' ? o.name : ''
  const log = (outcome: string, detail?: string) => logAction(logger, { operator: o.operator, server: name, action: 'create', outcome, detail })
  if (o.confirm !== true) return Promise.reject(new CreateError(400, 'confirm must be true'))
  const valid = validateName(o.name)
  if (!valid.ok) return Promise.reject(new CreateError(400, valid.message))
  if (PROTECTED_NAMES.includes(name)) {
    log('refused', 'protected name')
    return Promise.reject(new CreateError(403, `${name} is a protected server`))
  }
  const settings = validateSettings(o.settings ?? {}, 'create')
  if (!settings.ok) return Promise.reject(new CreateError(400, settings.message))
  return withLock(name, async () => {
    const made: { kind: string, name: string }[] = []
    try {
      if (await getServer(kubectl, name)) throw new CreateError(409, `a server named ${name} already exists`)
      const taken = Object.entries(await readTraefikPorts(kubectl))
      if (taken.some(([n]) => n === name)) throw new CreateError(409, `entrypoint mc-${name} already exists`)
      if (o.port !== undefined) {
        const p = validatePort(o.port, { ...ports, taken: taken.map(([, p]) => p) })
        if (!p.ok) throw new CreateError(400, p.message)
      }
      const operator = o.operator
      for (const obj of generateObjects({ name, settings: settings.value }) as { kind: string, metadata: { name: string, annotations?: Record<string, string> } }[]) {
        obj.metadata.annotations = { 'mc-manager/created-by': operator }
        await kubectl.run(['create', '-f', '-'], { stdin: JSON.stringify(obj) })
        made.push({ kind: obj.kind, name: obj.metadata.name })
      }
      let port = 0
      try {
        await applyTraefik(kubectl, (v) => {
          port = typeof o.port === 'number' ? o.port : nextFreePort(v, ports.min, ports.max)
          return addPort(v, name, port)
        })
      }
      catch (err) {
        if (err instanceof TraefikError) throw new CreateError(err.status, err.message)
        throw err
      }
      log('ok', `port ${port}`)
      return { server: name, firewall: { port, protocol: 'udp' as const } }
    }
    catch (err) {
      // Only what this call made, newest first; the Traefik entry is added last so it is never part of a rollback.
      for (const m of made.reverse()) {
        try {
          await kubectl.run(['delete', `${DELETE_KIND[m.kind]}/${m.name}`])
        }
        catch { /* best effort: the failure being reported is the original one */ }
      }
      log('failed', (err as Error).message)
      throw err
    }
  })
}
