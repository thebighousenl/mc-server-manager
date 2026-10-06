import { managerFetch, type ManagerDeps } from './manager'
import { serverRoutes, type ServerRoute } from './servers-routes'

export interface ForwardRequest {
  method: string
  /** Browser path without query, e.g. `/api/servers/foo/start`. */
  path: string
  /** Raw query string including `?`, or empty. */
  search?: string
  body?: string
  username: string
  signal?: AbortSignal
}

export type ForwardDeps = ManagerDeps & { routes?: ServerRoute[] }

const NAME = /^[a-z][a-z0-9-]{1,19}$/
const MAX_BODY = 16 * 1024
const TIMEOUT_MS = 15_000
const PASS_HEADERS = ['content-type', 'content-disposition', 'cache-control']

const reply = (status: number, error: string) => Response.json({ error }, { status })

// Returns the manager path for a route match, or a 404/400 response.
function match(routes: ServerRoute[], method: string, path: string): { route: ServerRoute, managerPath: string } | Response {
  const segs = path.split('/')
  for (const route of routes) {
    const pat = route.pattern.split('/')
    if (route.method !== method || pat.length !== segs.length) continue
    const out: string[] = []
    let ok = true
    for (const [i, p] of pat.entries()) {
      let seg: string
      try {
        seg = decodeURIComponent(segs[i]!)
      }
      catch {
        return reply(404, 'not_found')
      }
      if (p.startsWith(':')) {
        if (!seg || seg === '.' || seg === '..' || /[/\\]/.test(seg)) return reply(p === ':name' ? 400 : 404, p === ':name' ? 'invalid_name' : 'not_found')
        if (p === ':name' && !NAME.test(seg)) return reply(400, 'invalid_name')
        out.push(encodeURIComponent(seg))
      }
      else if (seg === p) out.push(p)
      else {
        ok = false
        break
      }
    }
    if (ok) return { route, managerPath: `/${out.slice(2).join('/')}` } // drop leading '' and 'api'
  }
  return reply(404, 'not_found')
}

// Only allow-listed routes reach the manager; the response is reduced to a few safe headers.
export async function forward(req: ForwardRequest, deps: ForwardDeps = { ...useRuntimeConfig(), fetch }): Promise<Response> {
  if (!deps.managerUrl || !deps.managerSecret) return reply(502, 'misconfigured')
  const m = match(deps.routes ?? serverRoutes, req.method, req.path)
  if (m instanceof Response) return m
  const { route, managerPath } = m

  const init: RequestInit = { method: req.method, signal: req.signal }
  if (req.body !== undefined) {
    if (Buffer.byteLength(req.body) > MAX_BODY) return reply(413, 'too_large')
    init.body = req.body
    init.headers = { 'Content-Type': 'application/json' }
  }
  if (!route.stream) init.signal = AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(req.signal ? [req.signal] : [])])

  let res: Response
  try {
    res = await managerFetch(managerPath + (req.search ?? ''), init, req.username, deps)
  }
  catch {
    return reply(502, 'unavailable')
  }
  // 401 from the manager means the shared secret is wrong: that is our fault, not the operator's session.
  if (res.status >= 500 || res.status === 401) return reply(502, 'unavailable')

  const headers = new Headers()
  for (const h of PASS_HEADERS) if (res.headers.has(h)) headers.set(h, res.headers.get(h)!)
  return new Response(res.body, { status: res.status, headers })
}
