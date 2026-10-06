import { isEditable } from '../servers/validate.js'
import { isProtected } from '../servers/protect.js'
import { APP_NAME, INSTANCE_LABEL, MANAGED_LABEL, NAME_LABEL, SERVER_LABEL } from './objects.js'

export type ServerState = 'stopped' | 'stopping' | 'starting' | 'running' | 'failing'
export interface Setting { key: string, value: string, editable: boolean }
export interface Server {
  name: string
  worldName: string
  gameMode: string
  port: number | null
  state: ServerState
  desired: 'running' | 'stopped'
  protected: boolean
  managed: boolean
  ageSeconds: number
}
export interface ServerDetail extends Server { settings: Setting[], resourceVersion: string }

interface Meta { name?: string, uid?: string, labels?: Record<string, string>, creationTimestamp?: string, resourceVersion?: string }
export interface Deployment {
  metadata: Meta
  spec: { replicas?: number, template: { spec: { containers: { env?: { name: string, value?: string }[] }[] } } }
}
export interface Pod {
  metadata: Meta
  status?: {
    conditions?: { type: string, status: string, reason?: string }[]
    containerStatuses?: { ready?: boolean, state?: { waiting?: { reason?: string } } }[]
  }
}

export interface DeriveOpts {
  traefikPorts: Record<string, number>
  serverStarted: (podUid: string) => boolean
  now?: () => number
}

const FAILING = ['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull']
const failing = (p: Pod) =>
  !!p.status?.containerStatuses?.some(c => FAILING.includes(c.state?.waiting?.reason ?? ''))
  || !!p.status?.conditions?.some(c => c.reason === 'Unschedulable')
const ready = (p: Pod) => !!p.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')

export function deriveServers(deployments: Deployment[], pods: Pod[], opts: DeriveOpts): ServerDetail[] {
  const now = (opts.now ?? Date.now)()
  return deployments
    .filter(d => d.metadata.labels?.[NAME_LABEL] === APP_NAME)
    .map((d) => {
      const labels = d.metadata.labels!
      const name = labels[SERVER_LABEL] ?? labels[INSTANCE_LABEL] ?? d.metadata.name!.replace(/^bedrock-/, '')
      const env = d.spec.template.spec.containers[0]?.env ?? []
      const value = (key: string) => env.find(e => e.name === key)?.value
      const mine = pods.filter(p => p.metadata.labels?.[INSTANCE_LABEL] === name)
      const desired = d.spec.replicas === 0 ? 'stopped' : 'running'
      let state: ServerState
      if (desired === 'stopped') state = mine.length ? 'stopping' : 'stopped'
      else if (mine.some(failing)) state = 'failing'
      else if (mine.some(p => ready(p) && opts.serverStarted(p.metadata.uid!))) state = 'running'
      else state = 'starting'
      return {
        name,
        worldName: value('LEVEL_NAME') ?? '',
        gameMode: value('GAMEMODE') ?? 'survival',
        port: opts.traefikPorts[name] ?? null,
        state,
        desired,
        protected: isProtected(name, labels),
        managed: labels[MANAGED_LABEL] === 'true',
        ageSeconds: Math.floor((now - Date.parse(d.metadata.creationTimestamp ?? '')) / 1000),
        settings: env.map(e => ({ key: e.name, value: e.value ?? '', editable: isEditable(e.name) })),
        resourceVersion: d.metadata.resourceVersion ?? '',
      }
    })
}
