export const LABEL_MANAGED = 'mc-manager/managed'
export const LABEL_SERVER = 'mc-manager/server'
export const LABEL_PROTECTED = 'mc-manager/protected'
export const LABEL_NAME = 'app.kubernetes.io/name'
export const LABEL_INSTANCE = 'app.kubernetes.io/instance'
export const APP_NAME = 'bedrock'

export function names(name: string) {
  return {
    deployment: `bedrock-${name}`,
    service: `bedrock-${name}`,
    route: `bedrock-${name}`,
    pvc: `bedrock-data-${name}`,
    entrypoint: `mc-${name}`,
  }
}

/** Only the labels the manager adds; the existing app.kubernetes.io/* labels are never touched. */
export function managerLabels(name: string, opts: { protected: boolean }): Record<string, string> {
  return {
    [LABEL_MANAGED]: 'true',
    [LABEL_SERVER]: name,
    ...(opts.protected && { [LABEL_PROTECTED]: 'true' }),
  }
}

export const selectorForServer = (name: string) => `${LABEL_INSTANCE}=${name},${LABEL_NAME}=${APP_NAME}`
