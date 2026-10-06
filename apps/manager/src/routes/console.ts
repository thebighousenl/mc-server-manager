import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { ConsoleError, getPlayers, sendCommand } from '../servers/console.js'
import { validateName } from '../servers/validate.js'

const CODES: Record<number, string> = { 400: 'invalid', 404: 'notfound', 422: 'not_ready' }

export function consoleRoutes(app: FastifyInstance, { kubectl }: Deps) {
  const guarded = async (name: string, reply: { code: (n: number) => { send: (b: object) => unknown } }, run: (name: string) => Promise<unknown>) => {
    const v = validateName(name)
    if (!v.ok) return reply.code(400).send({ error: 'invalid', message: v.message })
    try {
      return await run(v.value)
    }
    catch (err) {
      if (err instanceof ConsoleError) return reply.code(err.status).send({ error: CODES[err.status] ?? 'failed', message: err.message })
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  }

  app.post<{ Params: { name: string }, Body: { command?: unknown } | undefined }>('/servers/:name/command', (req, reply) =>
    guarded(req.params.name, reply, name =>
      sendCommand({ kubectl, logger: req.log }, name, req.body?.command, { operator: String(req.headers['x-operator'] ?? 'unknown') })))

  app.get<{ Params: { name: string } }>('/servers/:name/players', (req, reply) =>
    guarded(req.params.name, reply, name => getPlayers({ kubectl, logger: req.log }, name)))
}
