import { timingSafeEqual } from 'node:crypto'
import Fastify from 'fastify'
import type { Config } from './config.js'
import type { Kubectl } from './kube/kubectl.js'
import { healthRoutes } from './routes/health.js'
import { adoptRoutes } from './routes/adopt.js'
import { eventsRoutes } from './routes/events.js'
import { lifecycleRoutes } from './routes/lifecycle.js'
import { logsRoutes } from './routes/logs.js'
import { serverRoutes } from './routes/servers.js'
import { listServers } from './servers/list.js'
import { createPoller } from './servers/poller.js'

export interface Deps { kubectl: Kubectl }

export function buildApp(config: Config & { logLevel?: string, logStream?: { write(msg: string): void } }, deps: Deps) {
  const app = Fastify({
    logger: { level: config.logLevel ?? 'info', stream: config.logStream, redact: ['req.headers.authorization'] },
  })
  const expected = Buffer.from(config.secret)

  app.addHook('onRequest', async (req, reply) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
    const given = Buffer.from(m?.[1] ?? '')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })

  healthRoutes(app, config, deps)
  eventsRoutes(app, createPoller(() => listServers(deps.kubectl), config.pollMs))
  serverRoutes(app, deps)
  adoptRoutes(app, deps)
  lifecycleRoutes(app, deps)
  logsRoutes(app, deps)
  return app
}
