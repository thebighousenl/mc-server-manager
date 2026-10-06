import { ManagerMisconfigured } from './manager'
import { routes } from './servers-routes'

export interface GatewayRequest {
  method: string
  path: string // as received, including /api and the query string
  operator: string
  body?: string
  contentType?: string
  signal?: AbortSignal
}
export interface GatewayDeps {
  managerFetch: (path: string, init: RequestInit, operator: string) => Promise<Response>
}

const NAME = /^[a-z][a-z0-9-]{1,19}$/
const MAX_BODY = 16 * 1024
const RESPONSE_HEADERS = ['content-type', 'content-length', 'content-disposition', 'cache-control']
const json = (status: number, body: object) => Response.json(body, { status })

// Returns the manager path (without /api) for a listed route, or a ready error response.
function match(method: string, pathname: string): { route: (typeof routes)[number], path: string } | Response {
  const segs = pathname.split('/')
  for (const route of routes) {
    const pat = route.pattern.split('/')
    if (route.method !== method || pat.length !== segs.length) continue
    if (!pat.every((p, i) => p === ':name' || p === segs[i])) continue
    if (pat.some((p, i) => p === ':name' && !NAME.test(segs[i]!))) return json(400, { error: 'invalid_name' })
    return { route, path: segs.join('/').replace(/^\/api/, '') }
  }
  return json(404, { error: 'not_found' })
}

export async function forward(req: GatewayRequest, deps: GatewayDeps): Promise<Response> {
  const [pathname = '', query = ''] = req.path.split('?', 2)
  const m = match(req.method, pathname)
  if (m instanceof Response) return m
  const size = req.body === undefined ? 0 : Buffer.byteLength(req.body)
  if (size > MAX_BODY) return json(413, { error: 'too_large' })

  const search = new URLSearchParams(query).toString()
  const headers = new Headers()
  if (req.body !== undefined && req.contentType) headers.set('Content-Type', req.contentType)
  // Streams end when the browser leaves; other calls get a hard limit (stop waits for the pod to exit).
  const signal = m.route.stream ? req.signal : AbortSignal.any([AbortSignal.timeout(120_000), ...(req.signal ? [req.signal] : [])])
  let res: Response
  try {
    res = await deps.managerFetch(search ? `${m.path}?${search}` : m.path, { method: req.method, headers, body: req.body, signal }, req.operator)
  }
  catch (err) {
    return json(502, { error: err instanceof ManagerMisconfigured ? 'misconfigured' : 'unavailable' })
  }
  // 401 from the manager means our shared secret is wrong: never show that to the browser as a logout.
  if (res.status >= 500 || res.status === 401) return json(502, { error: 'unavailable' })

  const out = new Headers()
  for (const h of RESPONSE_HEADERS) if (res.headers.has(h)) out.set(h, res.headers.get(h)!)
  if (res.headers.get('content-type')?.startsWith('text/event-stream')) {
    out.set('Cache-Control', 'no-cache')
    out.set('X-Accel-Buffering', 'no')
  }
  return new Response(res.body, { status: res.status, headers: out })
}
