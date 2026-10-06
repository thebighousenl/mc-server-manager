export const MANAGED_LABEL = 'mc-manager/managed'
export const SERVER_LABEL = 'mc-manager/server'
export const PROTECTED_LABEL = 'mc-manager/protected'
export const NAME_LABEL = 'app.kubernetes.io/name'
export const INSTANCE_LABEL = 'app.kubernetes.io/instance'
export const APP_NAME = 'bedrock'

export const names = (name: string) => ({
  deployment: `bedrock-${name}`,
  service: `bedrock-${name}`,
  route: `bedrock-${name}`,
  pvc: `bedrock-data-${name}`,
  entrypoint: `mc-${name}`,
})

export const managerLabels = (name: string, opts: { protected: boolean }): Record<string, string> => ({
  [MANAGED_LABEL]: 'true',
  [SERVER_LABEL]: name,
  ...(opts.protected ? { [PROTECTED_LABEL]: 'true' } : {}),
})

export const selectorForServer = (name: string) => `${INSTANCE_LABEL}=${name},${NAME_LABEL}=${APP_NAME}`
