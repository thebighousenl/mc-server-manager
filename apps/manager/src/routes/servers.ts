import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { getServer, listServers } from '../servers/list.js'
import { validateName } from '../servers/validate.js'

export function serverRoutes(app: FastifyInstance, { kubectl }: Deps) {
  app.get('/servers', () => listServers(kubectl))

  app.get<{ Params: { name: string } }>('/servers/:name', async (req, reply) => {
    const v = validateName(req.params.name)
    if (!v.ok) return reply.code(400).send({ error: 'invalid', message: v.message })
    try {
      const server = await getServer(kubectl, v.value)
      return server ?? reply.code(404).send({ error: 'notfound', message: 'unknown server' })
    } catch (err) {
      if (!(err instanceof KubectlError)) throw err
      return reply.code(502).send({ error: 'unavailable', message: err.message })
    }
  })
}
