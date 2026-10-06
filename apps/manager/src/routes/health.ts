import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import type { Config } from '../config.js'
import { preflight } from '../kube/preflight.js'

export function healthRoutes(app: FastifyInstance, config: Config, { kubectl }: Deps) {
  app.get('/health', async () => {
    const { reachable, missing } = await preflight(kubectl, Date.now, config.kube.namespace)
    return { status: 'ok', uptimeSeconds: process.uptime(), cluster: { reachable, missing } }
  })
}
