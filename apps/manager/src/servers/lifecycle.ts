import type { Kubectl } from '../kube/kubectl.js'
import { names, selectorForServer } from '../kube/objects.js'
import { logAction } from './action-log.js'
import { getServer } from './list.js'
import { withLock } from './lock.js'

export class LifecycleError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface LifecycleDeps {
  kubectl: Kubectl
  logger: { info: (obj: object, msg?: string) => void }
  timeoutMs?: number // how long stop waits for the pod to exit
  pollMs?: number
}
interface Opts { operator: string, confirm?: boolean }
export interface LifecycleResult { server: string, warnings: string[] }

export const LATEST_WARNING = 'VERSION is LATEST: the newest server version is pulled on start and may irreversibly upgrade the world.'

// Shared by every mutating action: validate, take the lock, refuse unmanaged servers, log exactly one record.
function act(action: string, needsConfirm: boolean, body: (d: LifecycleDeps, name: string, desired: 'running' | 'stopped') => Promise<void>) {
  return (deps: LifecycleDeps, name: string, o: Opts): Promise<LifecycleResult> => {
    const log = (outcome: string, detail?: string) => logAction(deps.logger, { operator: o.operator, server: name, action, outcome, detail })
    if (Object.keys(o).some(k => k !== 'operator' && k !== 'confirm')) return Promise.reject(new LifecycleError(400, 'unknown field'))
    if (needsConfirm && o.confirm !== true) return Promise.reject(new LifecycleError(400, 'confirm must be true'))
    return withLock(name, async () => {
      try {
        const server = await getServer(deps.kubectl, name)
        if (!server) throw new LifecycleError(404, 'unknown server')
        if (!server.managed) throw new LifecycleError(409, `${name} is not managed yet: adopt it first`)
        await body(deps, name, server.desired)
        log('ok')
        const version = server.settings.find(s => s.key === 'VERSION')?.value
        return { server: name, warnings: action !== 'stop' && (!version || version === 'LATEST') ? [LATEST_WARNING] : [] }
      }
      catch (err) {
        log('failed', (err as Error).message)
        throw err
      }
    })
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const startServer = act('start', false, async ({ kubectl }, name, desired) => {
  if (desired === 'running') throw new LifecycleError(409, `${name} is already running`)
  await kubectl.run(['scale', `deploy/${names(name).deployment}`, '--replicas=1'])
})

export const restartServer = act('restart', true, async ({ kubectl }, name, desired) => {
  if (desired !== 'running') throw new LifecycleError(409, `${name} is not running`) // rollout restart at 0 replicas does nothing
  await kubectl.run(['rollout', 'restart', `deploy/${names(name).deployment}`])
})

// Graceful only: scale to 0 and wait for the pod to exit on its own. Callers hold the server lock.
export async function scaleDownAndWait(kubectl: Kubectl, name: string, timeoutMs = 90_000, pollMs = 1000) {
  await kubectl.run(['scale', `deploy/${names(name).deployment}`, '--replicas=0'])
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { stdout } = await kubectl.run(['get', 'pods', '-l', selectorForServer(name), '-o', 'json'])
    if (!JSON.parse(stdout).items.length) return
    if (Date.now() > deadline) throw new LifecycleError(409, `${name} is still stopping after ${Math.round(timeoutMs / 1000)}s; check it`)
    await sleep(pollMs)
  }
}

export const stopServer = act('stop', true, ({ kubectl, timeoutMs, pollMs }, name) => scaleDownAndWait(kubectl, name, timeoutMs, pollMs))
