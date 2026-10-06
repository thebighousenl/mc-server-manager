import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import type { Config } from '../config.js'
import { KubectlError } from '../kube/kubectl.js'
import { CreateError, createServer } from '../servers/create.js'
import { getServer } from '../servers/list.js'
import { pingServer } from '../servers/reachability.js'
import { validateName } from '../servers/validate.js'

const CODES: Record<number, string> = { 400: 'invalid', 403: 'protected', 404: 'notfound', 409: 'conflict' }

export function createRoutes(app: FastifyInstance, config: Config, { kubectl, ping = pingServer }: Deps) {
  app.post<{ Body: Record<string, unknown> | undefined }>('/servers', async (req, reply) => {
    const body = req.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['name', 'port', 'settings', 'confirm'].includes(k))) {
      return reply.code(400).send({ error: 'invalid', message: 'only name, port, settings and confirm are accepted' })
    }
    try {
      return await createServer({ kubectl, logger: req.log, ports: config.ports }, { ...body, operator: String(req.headers['x-operator'] ?? 'unknown') })
    }
    catch (err) {
      if (err instanceof CreateError) return reply.code(err.status).send({ error: CODES[err.status] ?? 'failed', message: err.message })
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  })

  // The host is the configured public address only; nothing from the request is used.
  app.post<{ Params: { name: string } }>('/servers/:name/reachability', async (req, reply) => {
    const name = validateName(req.params.name)
    if (!name.ok) return reply.code(400).send({ error: 'invalid', message: name.message })
    try {
      const server = await getServer(kubectl, name.value)
      if (!server?.port) return reply.code(404).send({ error: 'notfound', message: 'unknown server' })
      return { reachable: await ping(config.publicHost, server.port) }
    }
    catch (err) {
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  })
}
