import { KubectlError, type Kubectl } from '../kube/kubectl.js'
import { names } from '../kube/objects.js'
import { logAction } from './action-log.js'
import { getServer } from './list.js'
import { LATEST_WARNING } from './lifecycle.js'
import { withLock } from './lock.js'
import { validateSettings } from './validate.js'

export class SettingsError extends Error {
  constructor(readonly status: number, message: string, readonly code = '') {
    super(message)
  }
}

export interface SettingsDeps { kubectl: Kubectl, logger: { info: (obj: object, msg?: string) => void } }
export interface SettingsInput { settings?: unknown, resourceVersion?: unknown, confirm?: unknown, operator: string }

export function updateSettings({ kubectl, logger }: SettingsDeps, name: string, o: SettingsInput): Promise<{ server: string, warnings: string[] }> {
  const log = (outcome: string, detail?: string) => logAction(logger, { operator: o.operator, server: name, action: 'settings', outcome, detail })
  if (o.confirm !== true) return Promise.reject(new SettingsError(400, 'confirm must be true'))
  const settings = validateSettings(o.settings, 'update')
  if (!settings.ok) return Promise.reject(new SettingsError(400, settings.message))
  if (!Object.keys(settings.value).length) return Promise.reject(new SettingsError(400, 'no settings to change'))
  if (typeof o.resourceVersion !== 'string' || !o.resourceVersion) return Promise.reject(new SettingsError(400, 'resourceVersion is required'))
  const resourceVersion = o.resourceVersion
  return withLock(name, async () => {
    try {
      const server = await getServer(kubectl, name)
      if (!server) throw new SettingsError(404, 'unknown server')
      if (!server.managed) throw new SettingsError(409, `${name} is not managed yet: adopt it first`)
      const level = settings.value.LEVEL_NAME
      if (level !== undefined) {
        const worlds = server.state === 'running'
          ? (await kubectl.run(['exec', `deploy/${names(name).deployment}`, '--', 'ls', '/data/worlds'])).stdout.split('\n')
          : []
        if (!worlds.includes(level)) throw new SettingsError(422, 'LEVEL_NAME must be an existing world folder and the server must be running')
      }
      // Strategic merge keys containers and env entries by name, so every other env var is left alone.
      const { stdout } = await kubectl.run(['get', `deploy/${names(name).deployment}`, '-o', 'json'])
      const container: string = JSON.parse(stdout).spec.template.spec.containers[0].name
      const patch = {
        metadata: { resourceVersion },
        spec: { template: { spec: { containers: [{ name: container, env: Object.entries(settings.value).map(([k, v]) => ({ name: k, value: v })) }] } } },
      }
      try {
        await kubectl.run(['patch', `deploy/${names(name).deployment}`, '--type=strategic', '-p', JSON.stringify(patch)])
      }
      catch (err) {
        if (err instanceof KubectlError && err.code === 'conflict') throw new SettingsError(409, 'the server changed since you loaded it: reload and try again', 'stale')
        throw err
      }
      log('ok', Object.keys(settings.value).join(','))
      const version = settings.value.VERSION ?? server.settings.find(s => s.key === 'VERSION')?.value
      return { server: name, warnings: !version || version === 'LATEST' ? [LATEST_WARNING] : [] }
    }
    catch (err) {
      log('failed', (err as Error).message)
      throw err
    }
  })
}
