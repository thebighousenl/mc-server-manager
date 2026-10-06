import type { Kubectl } from '../kube/kubectl.js'
import { KubectlError } from '../kube/kubectl.js'
import { readTraefikPorts } from '../kube/traefik-read.js'
import { deriveServers, type Deployment, type Pod, type Server, type ServerDetail } from '../kube/state.js'
import { validateName } from './validate.js'

export interface ListResult { servers: Server[], clusterOk: boolean, error?: string }
export interface ListOpts { serverStarted?: (podUid: string) => boolean }

async function load(kubectl: Kubectl, opts: ListOpts): Promise<ServerDetail[]> {
  const [{ stdout }, traefikPorts] = await Promise.all([
    kubectl.run(['get', 'deploy,pods', '-o', 'json']),
    readTraefikPorts(kubectl),
  ])
  const items: { kind: string }[] = JSON.parse(stdout).items
  return deriveServers(
    items.filter(i => i.kind === 'Deployment') as unknown as Deployment[],
    items.filter(i => i.kind === 'Pod') as unknown as Pod[],
    { traefikPorts, serverStarted: opts.serverStarted ?? (() => true) },
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
