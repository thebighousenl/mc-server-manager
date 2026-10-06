export interface ManagementAction {
  operator: string
  server: string
  action: string
  outcome: string
  detail?: string
}

// Copies only the known fields, so secrets passed by mistake never reach the log.
export function logAction(logger: { info: (obj: object, msg?: string) => void }, a: ManagementAction) {
  logger.info({
    time: new Date().toISOString(),
    operator: a.operator,
    server: a.server,
    action: a.action,
    outcome: a.outcome,
    ...(a.detail === undefined ? {} : { detail: a.detail.slice(0, 200) }),
  }, 'management action')
}
