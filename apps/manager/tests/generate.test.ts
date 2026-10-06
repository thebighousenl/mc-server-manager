import { describe, expect, it } from 'vitest'
import { generateObjects } from '../src/kube/generate.js'
import { fixture } from './helpers/fake-kubectl.js'

const inst = { 'app.kubernetes.io/name': 'bedrock', 'app.kubernetes.io/instance': 'zz' }
const [pvc, deployment, service, route] = generateObjects({ name: 'zz', settings: { LEVEL_NAME: 'zz', MAX_PLAYERS: '8' } }) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any

describe('generateObjects', () => {
  it('returns PVC, Deployment, Service and IngressRouteUDP in apply order', () => {
    expect([pvc, deployment, service, route].map(o => o.kind)).toEqual(['PersistentVolumeClaim', 'Deployment', 'Service', 'IngressRouteUDP'])
    expect(generateObjects({ name: 'zz', settings: {} })).toHaveLength(4)
  })

  it('PVC: local-path RWO 5Gi, named bedrock-data-<name>', () => {
    expect(pvc.metadata.name).toBe('bedrock-data-zz')
    expect(pvc.metadata.labels['app.kubernetes.io/component']).toBe('storage')
    expect(pvc.spec).toEqual({ accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', resources: { requests: { storage: '5Gi' } } })
  })

  it('Deployment: Recreate, Always pull, env order, resources, mount and claim', () => {
    const c = deployment.spec.template.spec.containers[0]
    expect(deployment.metadata.name).toBe('bedrock-zz')
    expect(deployment.spec.replicas).toBe(1)
    expect(deployment.spec.strategy).toEqual({ type: 'Recreate' })
    expect(c.image).toBe('itzg/minecraft-bedrock-server:latest')
    expect(c.imagePullPolicy).toBe('Always')
    expect(c.tty && c.stdin).toBe(true)
    expect(c.env).toEqual([
      { name: 'EULA', value: 'TRUE' }, { name: 'VERSION', value: 'LATEST' }, { name: 'TRANSPORT', value: 'raknet' },
      { name: 'LEVEL_NAME', value: 'zz' }, { name: 'MAX_PLAYERS', value: '8' },
    ])
    expect(c.ports).toEqual([{ name: 'bedrock', containerPort: 19132, protocol: 'UDP' }])
    expect(c.resources).toEqual({ requests: { cpu: '250m', memory: '512Mi' }, limits: { memory: '2Gi' } })
    expect(c.volumeMounts).toEqual([{ name: 'data', mountPath: '/data' }])
    expect(deployment.spec.template.spec.volumes[0].persistentVolumeClaim.claimName).toBe('bedrock-data-zz')
  })

  it('a VERSION setting replaces the default in place', () => {
    const [, d] = generateObjects({ name: 'zz', settings: { VERSION: '1.21.50.07', LEVEL_NAME: 'zz' } }) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(d.spec.template.spec.containers[0].env.map((e: { name: string, value: string }) => `${e.name}=${e.value}`)).toEqual(['EULA=TRUE', 'VERSION=1.21.50.07', 'TRANSPORT=raknet', 'LEVEL_NAME=zz'])
  })

  it('Service, IngressRouteUDP, selectors and labels', () => {
    expect(service.metadata.name).toBe('bedrock-zz')
    expect(service.spec.selector).toEqual(inst)
    expect(service.spec.ports).toEqual([{ name: 'bedrock', port: 19132, targetPort: 'bedrock', protocol: 'UDP' }])
    expect(route.apiVersion).toBe('traefik.io/v1alpha1')
    expect(route.spec.entryPoints).toEqual(['mc-zz'])
    expect(route.spec.routes[0].services).toEqual([{ name: 'bedrock-zz', port: 19132 }])
    expect(deployment.spec.selector.matchLabels).toEqual(inst)
    expect(deployment.spec.template.metadata.labels).toEqual(inst)
    for (const o of [pvc, deployment, service, route]) {
      expect(o.metadata.labels).toMatchObject({ ...inst, 'mc-manager/managed': 'true', 'mc-manager/server': 'zz' })
      expect(o.metadata.labels['mc-manager/protected']).toBeUndefined()
    }
  })

  it('reproduces the kustomize-rendered daan objects (manager labels and namespace aside)', () => {
    const settings = Object.fromEntries(fixture('daan-rendered')[1].spec.template.spec.containers[0].env.slice(3).map((e: { name: string, value: string }) => [e.name, e.value]))
    const strip = (o: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const c = structuredClone(o)
      delete c.metadata.namespace
      for (const k of Object.keys(c.metadata.labels)) if (k.startsWith('mc-manager/')) delete c.metadata.labels[k]
      return c
    }
    expect(generateObjects({ name: 'daan', settings }).map(strip)).toEqual(fixture('daan-rendered').map(strip))
  })
})
