import { APP_NAME, INSTANCE_LABEL, MANAGED_LABEL, NAME_LABEL, SERVER_LABEL, names } from './objects.js'

type Obj = Record<string, unknown>

// Transcribed from the repo's base/ (research.md decision 9). Tests pin it to the rendered `daan` objects.
export function generateObjects({ name, settings }: { name: string, settings: Record<string, string> }): Obj[] {
  const n = names(name)
  const selector = { [NAME_LABEL]: APP_NAME, [INSTANCE_LABEL]: name }
  const labels = { ...selector, [MANAGED_LABEL]: 'true', [SERVER_LABEL]: name }
  const base: Record<string, string> = { EULA: 'TRUE', VERSION: 'LATEST', TRANSPORT: 'raknet' }
  const env = Object.entries({ ...base, ...settings }).map(([k, value]) => ({ name: k, value })) // VERSION keeps its slot
  return [
    {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: n.pvc, labels: { ...labels, 'app.kubernetes.io/component': 'storage' } },
      spec: { accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', resources: { requests: { storage: '5Gi' } } },
    },
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: n.deployment, labels },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        selector: { matchLabels: selector },
        template: {
          metadata: { labels: selector },
          spec: {
            containers: [{
              name: 'bedrock',
              image: 'itzg/minecraft-bedrock-server:latest',
              imagePullPolicy: 'Always',
              tty: true,
              stdin: true,
              env,
              ports: [{ name: 'bedrock', containerPort: 19132, protocol: 'UDP' }],
              resources: { requests: { cpu: '250m', memory: '512Mi' }, limits: { memory: '2Gi' } },
              volumeMounts: [{ name: 'data', mountPath: '/data' }],
            }],
            volumes: [{ name: 'data', persistentVolumeClaim: { claimName: n.pvc } }],
          },
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: n.service, labels },
      spec: { type: 'ClusterIP', selector, ports: [{ name: 'bedrock', port: 19132, targetPort: 'bedrock', protocol: 'UDP' }] },
    },
    {
      apiVersion: 'traefik.io/v1alpha1',
      kind: 'IngressRouteUDP',
      metadata: { name: n.route, labels },
      spec: { entryPoints: [n.entrypoint], routes: [{ services: [{ name: n.service, port: 19132 }] }] },
    },
  ]
}
