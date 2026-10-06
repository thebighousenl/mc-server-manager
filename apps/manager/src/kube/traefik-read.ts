import { parse } from 'yaml'
import type { Kubectl } from './kubectl.js'

// Read-only: ports keyed by server name (the `mc-` prefix of the entrypoint is stripped).
export async function readTraefikPorts(kubectl: Kubectl): Promise<Record<string, number>> {
  const { stdout } = await kubectl.run(['get', 'helmchartconfig', 'traefik', '-n', 'kube-system', '-o', 'json'])
  const values = parse(JSON.parse(stdout).spec?.valuesContent ?? '') as { ports?: Record<string, { exposedPort?: number }> } | null
  const ports: Record<string, number> = {}
  for (const [key, p] of Object.entries(values?.ports ?? {})) {
    if (key.startsWith('mc-') && typeof p?.exposedPort === 'number') ports[key.slice(3)] = p.exposedPort
  }
  return ports
}
