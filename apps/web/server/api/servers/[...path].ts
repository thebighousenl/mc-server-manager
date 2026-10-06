import { managerFetch } from '../../utils/manager'
import { abortOnDisconnect } from '../../utils/client-abort'
import { forward } from '../../utils/servers-gateway'

// Thin adapter: everything about which routes exist lives in servers-routes.ts.
export default defineEventHandler(async (event) => {
  const signal = abortOnDisconnect(event.node.req, event.node.res)
  const hasBody = event.method !== 'GET' && event.method !== 'HEAD'
  return forward({
    method: event.method,
    path: event.path,
    operator: event.context.auth?.username ?? '',
    body: hasBody ? await readRawBody(event, 'utf8') : undefined,
    contentType: getRequestHeader(event, 'content-type'),
    signal,
  }, { managerFetch })
})
