import { forward } from '../../utils/servers-gateway'

// Thin adapter: auth middleware has already required a session; the gateway does the allow-listing.
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  return forward({
    method: event.method,
    path: url.pathname,
    search: url.search,
    body: event.method === 'GET' || event.method === 'HEAD' ? undefined : await readRawBody(event, 'utf8'),
    username: event.context.auth.username,
  })
})
