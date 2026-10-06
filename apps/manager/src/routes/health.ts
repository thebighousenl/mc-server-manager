import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import type { Kubectl } from '../kube/kubectl.js'
import { preflight } from '../kube/preflight.js'

export function healthRoutes(app: FastifyInstance, config: Config, kubectl: Kubectl) {
  app.get('/health', async () => {
    const { reachable, missing } = await preflight(kubectl, { namespace: config.kube.namespace })
    return { status: 'ok', uptimeSeconds: process.uptime(), cluster: { reachable, missing } }
  })
}
