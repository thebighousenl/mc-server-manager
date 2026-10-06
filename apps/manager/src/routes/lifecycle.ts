import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { LifecycleError, restartServer, startServer, stopServer } from '../servers/lifecycle.js'
import { validateName } from '../servers/validate.js'

const CODES: Record<number, string> = { 400: 'invalid', 404: 'notfound', 409: 'conflict' }

export function lifecycleRoutes(app: FastifyInstance, { kubectl }: Deps) {
  const route = (action: 'start' | 'stop' | 'restart', run: typeof startServer, needsConfirm: boolean) =>
    app.post<{ Params: { name: string }, Body: Record<string, unknown> | undefined }>(`/servers/:name/${action}`, async (req, reply) => {
      const name = validateName(req.params.name)
      if (!name.ok) return reply.code(400).send({ error: 'invalid', message: name.message })
      const body = req.body ?? {}
      if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !needsConfirm || k !== 'confirm')) {
        return reply.code(400).send({ error: 'invalid', message: needsConfirm ? 'only confirm is accepted' : 'no body is accepted' })
      }
      const operator = String(req.headers['x-operator'] ?? 'unknown')
      try {
        return await run({ kubectl, logger: req.log }, name.value, { operator, ...(needsConfirm ? { confirm: body.confirm === true } : {}) })
      }
      catch (err) {
        if (err instanceof LifecycleError) return reply.code(err.status).send({ error: CODES[err.status] ?? 'failed', message: err.message })
        if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
        throw err
      }
    })
  route('start', startServer, false)
  route('stop', stopServer, true)
  route('restart', restartServer, true)
}
