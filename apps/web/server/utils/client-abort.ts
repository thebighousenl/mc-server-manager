import type { IncomingMessage, ServerResponse } from 'node:http'

// Aborts when the browser leaves before the response finished. Not req 'close': on current Node that fires once the request body is read.
export function abortOnDisconnect(_req: IncomingMessage, res: ServerResponse): AbortSignal {
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) abort.abort()
  })
  return abort.signal
}
