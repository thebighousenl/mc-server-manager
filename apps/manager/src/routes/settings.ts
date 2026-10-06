import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { SettingsError, updateSettings } from '../servers/settings.js'
import { validateName } from '../servers/validate.js'

const CODES: Record<number, string> = { 400: 'invalid', 404: 'notfound', 409: 'conflict', 422: 'not_ready' }

export function settingsRoutes(app: FastifyInstance, { kubectl }: Deps) {
  app.put<{ Params: { name: string }, Body: { settings?: unknown, resourceVersion?: unknown, confirm?: unknown } | undefined }>('/servers/:name/settings', async (req, reply) => {
    const name = validateName(req.params.name)
    if (!name.ok) return reply.code(400).send({ error: 'invalid', message: name.message })
    const body = req.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['settings', 'resourceVersion', 'confirm'].includes(k))) {
      return reply.code(400).send({ error: 'invalid', message: 'only settings, resourceVersion and confirm are accepted' })
    }
    try {
      return await updateSettings({ kubectl, logger: req.log }, name.value, { ...body, operator: String(req.headers['x-operator'] ?? 'unknown') })
    }
    catch (err) {
      if (err instanceof SettingsError) return reply.code(err.status).send({ error: err.code || CODES[err.status] || 'failed', message: err.message })
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  })
}
