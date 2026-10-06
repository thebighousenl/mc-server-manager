import type { Kubectl } from '../kube/kubectl.js'
import { managerLabels, selectorForServer } from '../kube/objects.js'
import { logAction } from './action-log.js'
import { withLock } from './lock.js'
import { isProtected } from './protect.js'

export class AdoptError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

interface Item { kind: string, metadata: { name: string, uid?: string, generation?: number, labels?: Record<string, string> } }
export interface AdoptChange { kind: string, name: string, add: Record<string, string> }
export interface AdoptPlan { server: string, changes: AdoptChange[] }

const WORKLOAD = 'deploy,svc,ingressrouteudp,pvc,pods'

async function snapshot(kubectl: Kubectl, name: string) {
  const { stdout } = await kubectl.run(['get', WORKLOAD, '-l', selectorForServer(name), '-o', 'json'])
  const items: Item[] = JSON.parse(stdout).items
  const deployment = items.find(i => i.kind === 'Deployment')
  if (!deployment) throw new AdoptError(404, `no bedrock server named ${name}`)
  const want = managerLabels(name, { protected: isProtected(name, deployment.metadata.labels) })
  return {
    generation: deployment.metadata.generation,
    pods: items.filter(i => i.kind === 'Pod').map(i => i.metadata.uid).sort().join(','),
    changes: items.filter(i => i.kind !== 'Pod').map(i => ({
      kind: i.kind,
      name: i.metadata.name,
      add: Object.fromEntries(Object.entries(want).filter(([k, v]) => i.metadata.labels?.[k] !== v)),
    })),
  }
}

export async function planAdopt(kubectl: Kubectl, name: string): Promise<AdoptPlan> {
  return { server: name, changes: (await snapshot(kubectl, name)).changes }
}

export interface AdoptDeps { kubectl: Kubectl, logger: { info: (obj: object, msg?: string) => void } }

// Labels only: the pod template is untouched, so nothing restarts. Verified by generation and pod UIDs.
export function adopt({ kubectl, logger }: AdoptDeps, name: string, o: { confirm: boolean, operator: string }) {
  if (!o.confirm) return Promise.reject(new AdoptError(400, 'confirm must be true'))
  const log = (outcome: string, detail?: string) => logAction(logger, { operator: o.operator, server: name, action: 'adopt', outcome, detail })
  return withLock(name, async () => {
    try {
      const before = await snapshot(kubectl, name)
      const changes = before.changes.filter(c => Object.keys(c.add).length)
      if (!changes.length) {
        log('ok', 'no changes')
        return { server: name, changed: false, message: 'no changes', changes: [] as AdoptChange[] }
      }
      for (const c of changes) {
        await kubectl.run(['label', `${c.kind.toLowerCase()}/${c.name}`, ...Object.entries(c.add).map(([k, v]) => `${k}=${v}`), '--overwrite'])
      }
      const after = await snapshot(kubectl, name)
      if (after.generation !== before.generation || after.pods !== before.pods) {
        throw new AdoptError(409, 'the server was restarted or changed during adoption; check it')
      }
      log('ok')
      return { server: name, changed: true, changes }
    }
    catch (err) {
      log('failed', (err as Error).message)
      throw err
    }
  })
}
