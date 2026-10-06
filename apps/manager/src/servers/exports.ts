import type { ChildProcess } from 'node:child_process'
import { KubectlError, type Kubectl } from '../kube/kubectl.js'
import { names } from '../kube/objects.js'
import { logAction } from './action-log.js'
import { getServer } from './list.js'
import { validateExportFile, validateSettings } from './validate.js'

export class ExportError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface ExportDeps {
  kubectl: Kubectl
  logger: { info: (obj: object, msg?: string) => void }
  exports: { size: string, storageClass: string }
  timeoutMs?: number // how long the export Job may run
  pollMs?: number
}

const EXPORTS = 'mc-exports'
const IMAGE = 'busybox:1.37'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const create = (kubectl: Kubectl, obj: object) => kubectl.run(['create', '-f', '-'], { stdin: JSON.stringify(obj) })
const exists = async (kubectl: Kubectl, ref: string) => (await kubectl.run(['get', ref, '--ignore-not-found', '-o', 'name'])).stdout.trim() !== ''

// Created on first export, never deleted by the manager.
export async function ensureExportsVolume({ kubectl, exports }: ExportDeps) {
  const labels = { 'app.kubernetes.io/name': EXPORTS }
  if (!await exists(kubectl, `pvc/${EXPORTS}`)) {
    await create(kubectl, {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: EXPORTS, labels },
      spec: { accessModes: ['ReadWriteOnce'], storageClassName: exports.storageClass, resources: { requests: { storage: exports.size } } },
    })
  }
  if (!await exists(kubectl, `deploy/${EXPORTS}`)) {
    await create(kubectl, {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: EXPORTS, labels },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        selector: { matchLabels: labels },
        template: {
          metadata: { labels },
          spec: {
            containers: [{ name: 'exports', image: IMAGE, command: ['sleep', 'infinity'], volumeMounts: [{ name: 'exports', mountPath: '/exports' }] }],
            volumes: [{ name: 'exports', persistentVolumeClaim: { claimName: EXPORTS } }],
          },
        },
      },
    })
    await kubectl.run(['rollout', 'status', `deploy/${EXPORTS}`, '--timeout=120s'], { timeoutMs: 130_000 })
  }
}

// The caller holds the server lock. Stopped servers only, so the copy is consistent.
export async function exportWorld(deps: ExportDeps, name: string, level: string, operator: string): Promise<string> {
  const { kubectl, logger, timeoutMs = 600_000, pollMs = 2000 } = deps
  const log = (outcome: string, detail?: string) => logAction(logger, { operator, server: name, action: 'export', outcome, detail })
  try {
    const v = validateSettings({ LEVEL_NAME: level }, 'update')
    if (!v.ok) throw new ExportError(400, 'invalid world name')
    const server = await getServer(kubectl, name)
    if (!server) throw new ExportError(404, 'unknown server')
    if (server.state !== 'stopped') throw new ExportError(409, `${name} must be stopped before its world is exported`)
    await ensureExportsVolume(deps)
    const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '')
    const file = `${name}-${level}-${stamp}.tgz`
    const job = `export-${name}-${Date.now()}`
    await create(kubectl, {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: job, labels: { 'mc-manager/server': name } },
      spec: {
        backoffLimit: 0,
        ttlSecondsAfterFinished: 3600, // a failed Job stays an hour for diagnosis, then goes away by itself
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [{
              name: 'export',
              image: IMAGE,
              command: ['tar', 'czf', `/exports/${file}`, '-C', '/data/worlds', level],
              volumeMounts: [{ name: 'data', mountPath: '/data', readOnly: true }, { name: 'exports', mountPath: '/exports' }],
            }],
            volumes: [
              { name: 'data', persistentVolumeClaim: { claimName: names(name).pvc, readOnly: true } },
              { name: 'exports', persistentVolumeClaim: { claimName: EXPORTS } },
            ],
          },
        },
      },
    })
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const status = JSON.parse((await kubectl.run(['get', `job/${job}`, '-o', 'json'])).stdout).status ?? {}
      if (status.succeeded) break
      if (status.failed) throw new ExportError(409, `exporting ${level} failed`)
      if (Date.now() > deadline) throw new ExportError(409, `exporting ${level} timed out`)
      await sleep(pollMs)
    }
    await kubectl.run(['delete', `job/${job}`]).catch(() => {}) // the file stays; only the finished Job goes
    log('ok', file)
    return file
  }
  catch (err) {
    log('failed', (err as Error).message)
    throw err
  }
}

export interface ExportInfo { file: string, server: string, sizeBytes: number, createdAt: string }

export async function listExports(kubectl: Kubectl): Promise<ExportInfo[]> {
  let out: string
  try {
    out = (await kubectl.run(['exec', `deploy/${EXPORTS}`, '--', 'sh', '-c', 'cd /exports && for f in *.tgz; do [ -f "$f" ] && stat -c "%n|%s" "$f"; done; true'])).stdout
  }
  catch (err) {
    if (err instanceof KubectlError && err.code === 'notfound') return [] // nothing exported yet
    throw err
  }
  return out.split('\n').flatMap((line) => {
    const [file = '', size = ''] = line.split('|')
    // ponytail: the server part is the shortest prefix, so a dashed server name lists as its first segment; the file name stays exact.
    const m = validateExportFile(file).ok ? /^([a-z][a-z0-9]*)-.+-(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z\.tgz$/.exec(file) : null
    return m ? [{ file, server: m[1]!, sizeBytes: Number(size), createdAt: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}Z` }] : []
  })
}

// null = no such file. The name is validated before any kubectl call.
export async function readExport(kubectl: Kubectl, file: unknown): Promise<ChildProcess | null> {
  const v = validateExportFile(file)
  if (!v.ok) throw new ExportError(400, v.message)
  const path = `/exports/${v.value}`
  if ((await kubectl.run(['exec', `deploy/${EXPORTS}`, '--', 'test', '-f', path])).code !== 0) return null
  return kubectl.spawn(['exec', `deploy/${EXPORTS}`, '--', 'cat', path])
}
