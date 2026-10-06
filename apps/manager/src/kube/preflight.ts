import { KubectlError, type Kubectl } from './kubectl.js'

export interface PreflightResult {
  ok: boolean
  reachable: boolean
  missing: string[]
}

interface Row {
  resource: string // as `kubectl auth can-i` wants it, API group included where needed
  subresource?: string
  name?: string
  /** Fixed namespace; rows without one use the configured namespace. */
  namespace?: string
  verbs: string[]
}

const CRUD = ['get', 'list', 'patch', 'create', 'delete']

// Mirrors specs/003-kubectl-deployment-management/contracts/rbac.md
export const PERMISSIONS: Row[] = [
  { resource: 'deployments', verbs: [...CRUD, 'watch'] },
  { resource: 'deployments', subresource: 'scale', verbs: [...CRUD, 'watch'] },
  { resource: 'pods', verbs: ['get', 'list', 'watch'] },
  { resource: 'pods', subresource: 'log', verbs: ['get', 'list', 'watch'] },
  { resource: 'pods', subresource: 'exec', verbs: ['create'] },
  { resource: 'services', verbs: CRUD },
  { resource: 'persistentvolumeclaims', verbs: CRUD },
  { resource: 'ingressrouteudps.traefik.io', verbs: CRUD },
  { resource: 'jobs.batch', verbs: ['get', 'list', 'watch', 'create', 'delete'] },
  { resource: 'helmchartconfigs.helm.cattle.io', name: 'traefik', namespace: 'kube-system', verbs: ['get', 'update', 'patch'] },
]

const TTL_MS = 10_000
const cache = new WeakMap<Kubectl, { at: number; result: Promise<PreflightResult> }>()

async function check(kubectl: Kubectl, namespace: string): Promise<PreflightResult> {
  const missing: string[] = []
  let reachable = true
  const checks = PERMISSIONS.flatMap((row) =>
    row.verbs.map(async (verb) => {
      const ns = row.namespace ?? namespace
      const args = [
        'auth', 'can-i', verb, row.name ? `${row.resource}/${row.name}` : row.resource,
        '--namespace', ns,
        ...(row.subresource ? [`--subresource=${row.subresource}`] : []),
      ]
      let answer: string
      try {
        answer = (await kubectl.run(args, { namespace: null })).stdout
      } catch (err) {
        // `can-i` exits 1 with "no" when the permission is missing; anything else means we could not ask.
        if (err instanceof KubectlError && (err.stdout.trim() === 'no' || err.code === 'forbidden')) answer = 'no'
        else return void (reachable = false)
      }
      if (answer.trim() !== 'yes') {
        const base = row.resource.split('.')[0]
        missing.push(`${verb} ${base}${row.subresource ? `/${row.subresource}` : ''}${row.name ? `/${row.name}` : ''} (${ns})`)
      }
    }),
  )
  await Promise.all(checks)
  return reachable ? { ok: missing.length === 0, reachable, missing } : { ok: false, reachable: false, missing: [] }
}

/** Verifies the manager's identity holds every permission it needs. Never throws; cached for 10 s. */
export function preflight(
  kubectl: Kubectl,
  { namespace = 'minecraft-servers', now = Date.now }: { namespace?: string; now?: () => number } = {},
): Promise<PreflightResult> {
  const hit = cache.get(kubectl)
  if (hit && now() - hit.at <= TTL_MS) return hit.result
  const result = check(kubectl, namespace).catch((): PreflightResult => ({ ok: false, reachable: false, missing: [] }))
  cache.set(kubectl, { at: now(), result })
  return result
}
