import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { abortOnDisconnect } from '../server/utils/client-abort'

// A POST with a body must not abort while the client still waits; only a real disconnect aborts.
function run(onClient: (signal: AbortSignal, release: () => void) => Promise<void>, clientDestroys: boolean) {
  return new Promise<void>((done, fail) => {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const server = createServer(async (req, res) => {
      const signal = abortOnDisconnect(req, res)
      for await (const _ of req); // consume the body like readRawBody
      await new Promise(r => setTimeout(r, 50))
      try {
        await onClient(signal, release)
      }
      catch (e) {
        fail(e)
      }
      await gate
      res.end('ok')
    })
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo
      const req = request({ port, method: 'POST', headers: { 'content-type': 'application/json' } }, (r) => {
        r.resume()
        r.on('end', () => server.close(() => done()))
      })
      req.on('error', () => server.close(() => done()))
      req.end('{"a":1}')
      if (clientDestroys) setTimeout(() => req.destroy(), 150)
    })
  })
}

describe('abortOnDisconnect', () => {
  it('stays live after the request body is read', async () => {
    await run(async (signal, release) => {
      expect(signal.aborted).toBe(false)
      release()
    }, false)
  })

  it('aborts when the client disconnects', async () => {
    await run(async (signal, release) => {
      await new Promise(r => setTimeout(r, 250))
      expect(signal.aborted).toBe(true)
      release()
    }, true)
  })
})
