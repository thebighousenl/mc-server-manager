import type { FastifyInstance } from 'fastify'
import type { createPoller } from '../servers/poller.js'

export function eventsRoutes(app: FastifyInstance, poller: ReturnType<typeof createPoller>) {
  app.get('/servers/events', (req, reply) => {
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    const unsubscribe = poller.subscribe((e) => {
      res.write(e.type === 'servers'
        ? `event: servers\ndata: ${JSON.stringify(e.data)}\n\n`
        : `event: error\ndata: ${JSON.stringify({ error: 'unavailable', message: e.message })}\n\n`)
    })
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000)
    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      res.end()
    })
  })
}
