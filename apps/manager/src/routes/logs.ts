import type { FastifyInstance } from 'fastify'
import type { Deps } from '../app.js'
import { KubectlError } from '../kube/kubectl.js'
import { names } from '../kube/objects.js'
import { getServer } from '../servers/list.js'
import { validateName } from '../servers/validate.js'

export function logsRoutes(app: FastifyInstance, { kubectl }: Deps) {
  app.get<{ Params: { name: string }, Querystring: { follow?: string, tail?: string } }>('/servers/:name/logs', async (req, reply) => {
    const name = validateName(req.params.name)
    if (!name.ok) return reply.code(400).send({ error: 'invalid', message: name.message })
    const tail = Math.min(Math.max(Math.trunc(Number(req.query.tail)) || 200, 1), 1000)
    const args = (...pre: string[]) => ['logs', ...pre, `deploy/${names(name.value).deployment}`, `--tail=${tail}`]
    try {
      if (!await getServer(kubectl, name.value)) return reply.code(404).send({ error: 'notfound', message: 'unknown server' })
      if (req.query.follow !== '1') return reply.type('text/plain').send((await kubectl.run(args())).stdout)
    }
    catch (err) {
      if (!(err instanceof KubectlError)) throw err
      return reply.code(502).send({ error: 'unavailable', message: err.message })
    }
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.flushHeaders()
    const child = kubectl.spawn(args('-f'))
    let partial = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      const lines = (partial + chunk.toString()).split('\n')
      partial = lines.pop()!
      for (const line of lines) res.write(`data: ${line}\n\n`)
    })
    child.on('error', () => res.end())
    child.on('close', () => res.end())
    res.on('close', () => child.kill())
  })
}
