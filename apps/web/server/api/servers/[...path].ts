import { managerFetch } from '../../utils/manager'
import { forward } from '../../utils/servers-gateway'

// Thin adapter: everything about which routes exist lives in servers-routes.ts.
export default defineEventHandler(async (event) => {
  const abort = new AbortController()
  event.node.req.on('close', () => abort.abort())
  const hasBody = event.method !== 'GET' && event.method !== 'HEAD'
  return forward({
    method: event.method,
    path: event.path,
    operator: event.context.auth?.username ?? '',
    body: hasBody ? await readRawBody(event, 'utf8') : undefined,
    contentType: getRequestHeader(event, 'content-type'),
    signal: abort.signal,
  }, { managerFetch })
})
