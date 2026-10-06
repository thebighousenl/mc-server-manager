import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import type { Config } from '../config.js'
import { KubectlError } from '../kube/kubectl.js'
import { logAction } from '../servers/action-log.js'
import { DeleteError, deleteServer } from '../servers/delete.js'
import { ExportError } from '../servers/exports.js'
import { PROTECTED_NAMES } from '../servers/protect.js'
import { validateName } from '../servers/validate.js'

const CODES: Record<number, string> = { 400: 'invalid', 403: 'protected', 404: 'notfound', 409: 'conflict' }

export function deleteRoutes(app: FastifyInstance, config: Config, { kubectl }: Deps) {
  app.delete<{ Params: { name: string }, Body: unknown }>('/servers/:name', {
    // Before body parsing: the five known servers get 403 whatever the body is, with no kubectl call.
    onRequest: async (req, reply) => {
      const name = (req.params as { name: string }).name
      if (!PROTECTED_NAMES.includes(name)) return
      logAction(req.log, { operator: String(req.headers['x-operator'] ?? 'unknown'), server: name, action: 'delete', outcome: 'refused', detail: 'protected name' })
      return reply.code(403).send({ error: 'protected', message: `${name} is a protected server and cannot be deleted` })
    },
  }, async (req, reply) => {
    const name = validateName(req.params.name)
    if (!name.ok) return reply.code(400).send({ error: 'invalid', message: name.message })
    const body = req.body
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return reply.code(400).send({ error: 'invalid', message: 'body must be { confirmName }' })
    try {
      return await deleteServer(
        { kubectl, logger: req.log, exports: config.exports },
        name.value,
        { ...body, operator: String(req.headers['x-operator'] ?? 'unknown') },
      )
    }
    catch (err) {
      if (err instanceof DeleteError || err instanceof ExportError) return reply.code(err.status).send({ error: CODES[err.status] ?? 'failed', message: err.message })
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  })
}
