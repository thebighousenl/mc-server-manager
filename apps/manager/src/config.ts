export interface Config {
  secret: string
  host: string
  port: number
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
  return { secret, host: env.MANAGER_HOST || '127.0.0.1', port }
}
