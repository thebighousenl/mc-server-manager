import { timingSafeEqual } from 'node:crypto'
import Fastify from 'fastify'
import type { Config } from './config.js'
import type { Kubectl } from './kube/kubectl.js'
import { healthRoutes } from './routes/health.js'

export function buildApp(config: Config & { logLevel?: string }, deps: { kubectl: Kubectl }) {
  const app = Fastify({
    logger: { level: config.logLevel ?? 'info', redact: ['req.headers.authorization'] },
  })
  const expected = Buffer.from(config.secret)

  app.addHook('onRequest', async (req, reply) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
    const given = Buffer.from(m?.[1] ?? '')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })

  healthRoutes(app, config, deps.kubectl)
  return app
}
