import { KubectlError, type Kubectl } from './kubectl.js'

export interface PreflightResult { ok: boolean, reachable: boolean, missing: string[] }

const CRUD = ['get', 'list', 'watch', 'patch', 'create', 'delete']
// Mirrors specs/003-kubectl-deployment-management/contracts/rbac.md.
const ROWS: { resource: string, verbs: string[], namespace?: string, name?: string }[] = [
  { resource: 'deployments', verbs: CRUD },
  { resource: 'deployments/scale', verbs: CRUD },
  { resource: 'pods', verbs: ['get', 'list', 'watch'] },
  { resource: 'pods/log', verbs: ['get', 'list', 'watch'] },
  { resource: 'pods/exec', verbs: ['create'] },
  { resource: 'services', verbs: ['get', 'list', 'patch', 'create', 'delete'] },
  { resource: 'persistentvolumeclaims', verbs: ['get', 'list', 'patch', 'create', 'delete'] },
  { resource: 'ingressrouteudps.traefik.io', verbs: ['get', 'list', 'patch', 'create', 'delete'] },
  { resource: 'jobs.batch', verbs: ['get', 'list', 'watch', 'create', 'delete'] },
  { resource: 'helmchartconfigs.helm.cattle.io', verbs: ['get', 'update', 'patch'], namespace: 'kube-system', name: 'traefik' },
]

const TTL_MS = 10_000
const cache = new WeakMap<Kubectl, { at: number, result: PreflightResult }>()

export async function preflight(kubectl: Kubectl, now: () => number = Date.now, namespace = 'minecraft-servers'): Promise<PreflightResult> {
  const hit = cache.get(kubectl)
  if (hit && now() - hit.at < TTL_MS) return hit.result
  let reachable = true
  const checks = ROWS.flatMap(r => r.verbs.map(async (verb) => {
    const ns = r.namespace ?? namespace
    const args = ['auth', 'can-i', verb, r.resource, '-n', ns, ...(r.name ? ['--resource-name', r.name] : [])]
    try {
      const { stdout } = await kubectl.run(args)
      return stdout.trim() === 'yes' ? null : `${verb} ${r.resource} (${ns})`
    }
    catch (err) {
      if (err instanceof KubectlError && err.code === 'unreachable') reachable = false
      return `${verb} ${r.resource} (${ns})`
    }
  }))
  const missing = (await Promise.all(checks)).filter((m): m is string => m !== null)
  const result = reachable
    ? { ok: missing.length === 0, reachable, missing }
    : { ok: false, reachable, missing: [] }
  cache.set(kubectl, { at: now(), result })
  return result
}
