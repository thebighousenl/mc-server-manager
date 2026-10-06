import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { ExportError, listExports, readExport } from '../servers/exports.js'

export function exportsRoutes(app: FastifyInstance, { kubectl }: Deps) {
  app.get('/exports', async (_req, reply) => {
    try {
      return { exports: await listExports(kubectl) }
    }
    catch (err) {
      if (!(err instanceof KubectlError)) throw err
      return reply.code(502).send({ error: 'unavailable', message: err.message })
    }
  })

  app.get<{ Params: { file: string } }>('/exports/:file', async (req, reply) => {
    try {
      const child = await readExport(kubectl, req.params.file)
      if (!child) return reply.code(404).send({ error: 'notfound', message: 'unknown export' })
      reply.raw.on('close', () => child.kill())
      return reply.type('application/gzip').header('content-disposition', `attachment; filename="${req.params.file}"`).send(child.stdout)
    }
    catch (err) {
      if (err instanceof ExportError) return reply.code(err.status).send({ error: 'invalid', message: err.message })
      if (err instanceof KubectlError) return reply.code(502).send({ error: 'unavailable', message: err.message })
      throw err
    }
  })
}
