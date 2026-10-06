import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { AdoptError, adopt, planAdopt } from '../servers/adopt.js'
import { validateName } from '../servers/validate.js'

export function adoptRoutes(app: FastifyInstance, { kubectl }: Deps) {
  app.post<{ Params: { name: string }, Body: { confirm?: unknown } | undefined }>('/servers/:name/adopt', async (req, reply) => {
    const name = validateName(req.params.name)
    if (!name.ok) return reply.code(400).send({ error: 'invalid', message: name.message })
    const confirm = req.body?.confirm
    if (typeof confirm !== 'boolean') return reply.code(400).send({ error: 'invalid', message: 'confirm must be true or false' })
    const operator = String(req.headers['x-operator'] ?? 'unknown')
    try {
      return confirm ? await adopt({ kubectl, logger: req.log }, name.value, { confirm, operator }) : await planAdopt(kubectl, name.value)
    }
    catch (err) {
      if (err instanceof AdoptError) return reply.code(err.status).send({ error: err.status === 404 ? 'notfound' : 'conflict', message: err.message })
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  })
}
