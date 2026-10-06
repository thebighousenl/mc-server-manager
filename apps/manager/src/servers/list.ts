import type { Kubectl } from '../kube/kubectl.js'
import { KubectlError } from '../kube/kubectl.js'
import { readTraefikPorts } from '../kube/traefik-read.js'
import { APP_NAME, NAME_LABEL } from '../kube/objects.js'
import { deriveServers, type Deployment, type Pod, type Server, type ServerDetail } from '../kube/state.js'
import { startedTracker, type StartedTracker } from './ready.js'
import { validateName } from './validate.js'

export interface ListResult { servers: Server[], clusterOk: boolean, error?: string }
export interface ListOpts { tracker?: StartedTracker }

async function load(kubectl: Kubectl, opts: ListOpts): Promise<ServerDetail[]> {
  const [{ stdout }, traefikPorts] = await Promise.all([
    kubectl.run(['get', 'deploy,pods', '-o', 'json']),
    readTraefikPorts(kubectl),
  ])
  const items: { kind: string }[] = JSON.parse(stdout).items
  const pods = items.filter(i => i.kind === 'Pod') as unknown as Pod[]
  const tracker = opts.tracker ?? startedTracker
  // Only Ready pods not yet seen started cost a `logs` call; tracked UIDs are free.
  await Promise.all(pods.filter(p => p.metadata.labels?.[NAME_LABEL] === APP_NAME && p.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') && !tracker.has(p.metadata.uid!))
    .map(async (p) => {
      try {
        tracker.check(p.metadata.uid!, (await kubectl.run(['logs', `pod/${p.metadata.name!}`, '--tail=2000'])).stdout)
      }
      catch (err) {
        if (!(err instanceof KubectlError)) throw err // a pod that vanished meanwhile is just not started yet
      }
    }))
  return deriveServers(
    items.filter(i => i.kind === 'Deployment') as unknown as Deployment[],
    pods,
    { traefikPorts, serverStarted: uid => tracker.has(uid) },
  )
}

export async function listServers(kubectl: Kubectl, opts: ListOpts = {}): Promise<ListResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const servers = (await load(kubectl, opts)).map(({ settings, resourceVersion, ...server }) => server)
    return { servers, clusterOk: true }
  } catch (err) {
    if (!(err instanceof KubectlError)) throw err
    return { servers: [], clusterOk: false, error: err.message }
  }
}

// null = invalid, unknown or unrelated name; a KubectlError propagates when the cluster fails.
export async function getServer(kubectl: Kubectl, name: string, opts: ListOpts = {}): Promise<ServerDetail | null> {
  if (!validateName(name).ok) return null
  return (await load(kubectl, opts)).find(s => s.name === name) ?? null
}
