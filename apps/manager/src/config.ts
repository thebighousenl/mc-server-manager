export interface Config {
  secret: string
  host: string
  port: number
  kube: { namespace: string, context?: string, kubeconfig?: string, bin: string }
  ports: { min: number, max: number }
  pollMs: number
  exports: { size: string, storageClass: string }
}

function intVar(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number): number {
  const n = Number(env[key] ?? def)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} is not valid: ${env[key]}`)
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
  if (!/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(namespace)) {
    throw new Error(`MC_NAMESPACE is not a valid DNS label: ${namespace}`)
  }
  const min = intVar(env, 'MC_PORT_MIN', 19132, 1, 65535)
  const max = intVar(env, 'MC_PORT_MAX', 19999, 1, 65535)
  if (min > max) throw new Error('MC_PORT_MIN must not be greater than MC_PORT_MAX')
  const size = env.MC_EXPORTS_SIZE || '20Gi'
  if (!/^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E|m)?$/.test(size)) {
    throw new Error(`MC_EXPORTS_SIZE is not a Kubernetes quantity: ${size}`)
  }
  return {
    secret,
    host: env.MANAGER_HOST || '127.0.0.1',
    port,
    kube: {
      namespace,
      context: env.KUBE_CONTEXT || undefined,
      kubeconfig: env.KUBECONFIG || undefined,
      bin: env.KUBECTL_BIN || 'kubectl',
    },
    ports: { min, max },
    pollMs: intVar(env, 'MC_POLL_MS', 3000, 500, Infinity),
    exports: { size, storageClass: env.MC_EXPORTS_STORAGE_CLASS || 'local-path' },
  }
}
