export interface KubeConfig {
  namespace: string
  context?: string
  kubeconfig?: string
  bin: string
  pollMs: number
  exportsSize: string
  exportsStorageClass: string
}

export interface Config {
  secret: string
  host: string
  port: number
  kube: KubeConfig
  ports: { min: number; max: number }
}

const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/
const QUANTITY = /^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E)?$/

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number, what: string) {
  const n = Number(env[name] ?? fallback)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} is not ${what}: ${env[name]}`)
  }
  return n
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const secret = env.MANAGER_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('MANAGER_SECRET must be set and at least 32 characters')
  }
  const port = Number(env.MANAGER_PORT ?? 3001)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`MANAGER_PORT is not a valid port: ${env.MANAGER_PORT}`)
  }

  const namespace = env.MC_NAMESPACE || 'minecraft-servers'
  if (!DNS_LABEL.test(namespace)) {
    throw new Error(`MC_NAMESPACE is not a valid DNS label: ${namespace}`)
  }
  const exportsSize = env.MC_EXPORTS_SIZE || '20Gi'
  if (!QUANTITY.test(exportsSize)) {
    throw new Error(`MC_EXPORTS_SIZE is not a Kubernetes quantity: ${exportsSize}`)
  }
  const min = int(env, 'MC_PORT_MIN', 19132, 1, 65535, 'a valid port')
  const max = int(env, 'MC_PORT_MAX', 19999, 1, 65535, 'a valid port')
  if (min > max) throw new Error(`MC_PORT_MIN must not exceed MC_PORT_MAX: ${min} > ${max}`)

  return {
    secret,
    host: env.MANAGER_HOST || '127.0.0.1',
    port,
    kube: {
      namespace,
      context: env.KUBE_CONTEXT || undefined,
      kubeconfig: env.KUBECONFIG || undefined,
      bin: env.KUBECTL_BIN || 'kubectl',
      pollMs: int(env, 'MC_POLL_MS', 3000, 500, Number.MAX_SAFE_INTEGER, 'an integer >= 500'),
      exportsSize,
      exportsStorageClass: env.MC_EXPORTS_STORAGE_CLASS || 'local-path',
    },
    ports: { min, max },
  }
}
