import { MANAGED_LABEL, PROTECTED_LABEL, names, selectorForServer } from '../kube/objects.js'
import { applyTraefik, readTraefikPorts, removePort, TraefikError } from '../kube/traefik.js'
import { logAction } from './action-log.js'
import { exportWorld, type ExportDeps } from './exports.js'
import { scaleDownAndWait } from './lifecycle.js'
import { withLock } from './lock.js'
import { PROTECTED_NAMES } from './protect.js'
import { validateName } from './validate.js'

export class DeleteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface DeleteDeps extends ExportDeps { stopTimeoutMs?: number }
export interface DeleteInput { confirmName?: unknown, operator: string, [extra: string]: unknown }

interface Item { kind: string, metadata: { name: string, labels?: Record<string, string> }, spec?: { template?: { spec?: { containers?: { env?: { name: string, value?: string }[] }[] } } } }

export function deleteServer(deps: DeleteDeps, name: string, o: DeleteInput): Promise<{ server: string, exported?: string }> {
  const { kubectl } = deps
  const log = (outcome: string, detail?: string) => logAction(deps.logger, { operator: o.operator, server: name, action: 'delete', outcome, detail })
  const refuse = (status: number, message: string) => new DeleteError(status, message)
  const attempt = async () => {
    if (!validateName(name).ok) throw refuse(400, 'invalid server name')
    // Known names first: no body, label or cluster state can change this answer, and nothing is read or written.
    if (PROTECTED_NAMES.includes(name)) throw refuse(403, `${name} is a protected server and cannot be deleted`)
    if (Object.keys(o).some(k => k !== 'operator' && k !== 'confirmName')) throw refuse(400, 'only confirmName is accepted')
    if (o.confirmName !== name) throw refuse(400, 'confirmName must equal the server name')
    return withLock(name, async () => {
      const listed = JSON.parse((await kubectl.run(['get', 'deploy,svc,ingressrouteudp,pvc', '-l', selectorForServer(name), '-o', 'json'])).stdout).items as Item[]
      const ports = await readTraefikPorts(kubectl)
      if (!listed.length && !(name in ports)) throw refuse(404, 'unknown server')
      if (listed.some(i => i.metadata.labels?.[PROTECTED_LABEL] === 'true')) throw refuse(403, `${name} is protected and cannot be deleted`)
      if (listed.some(i => i.metadata.labels?.[MANAGED_LABEL] !== 'true')) throw refuse(409, `${name} is not managed yet: adopt it first`)
      const n = names(name)
      // The PVC (the world) goes last. Short kinds as kubectl takes them.
      const order = [['IngressRouteUDP', 'ingressrouteudp', n.route], ['Service', 'service', n.service], ['Deployment', 'deployment', n.deployment], ['PersistentVolumeClaim', 'pvc', n.pvc]]
      const deployment = listed.find(i => i.kind === 'Deployment')
      let exported: string | undefined
      // The Deployment still existing means no earlier attempt got past the export; without it the world was exported already.
      if (deployment) {
        const level = deployment.spec?.template?.spec?.containers?.[0]?.env?.find(e => e.name === 'LEVEL_NAME')?.value ?? name
        await scaleDownAndWait(kubectl, name, deps.stopTimeoutMs, deps.pollMs)
        exported = (await exportWorld(deps, name, level, o.operator)) ?? undefined
      }
      if (name in ports) {
        try {
          await applyTraefik(kubectl, v => removePort(v, name))
        }
        catch (err) {
          if (err instanceof TraefikError) throw refuse(err.status, err.message)
          throw err
        }
      }
      for (const [kind, short, objName] of order) {
        if (listed.some(i => i.kind === kind)) await kubectl.run(['delete', `${short}/${objName}`])
      }
      return { server: name, ...(exported ? { exported } : {}) }
    })
  }
  return attempt().then(
    (res) => { log('ok', res.exported); return res },
    (err) => {
      log(err instanceof DeleteError ? 'refused' : 'failed', (err as Error).message)
      throw err
    },
  )
}
