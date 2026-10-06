const SECRET_FIELDS = ['password', 'passwordHash', 'token']

export interface AuthLogFields {
  level?: 'info' | 'warn' | 'error'
  username?: string
  ip?: string
}

// One JSON line per event to stdout; secrets are stripped even if a caller passes them.
export function authLog(event: string, fields: AuthLogFields = {}): void {
  const entry: Record<string, unknown> = { level: 'info', ts: new Date().toISOString(), event, ...fields }
  for (const key of SECRET_FIELDS) delete entry[key]
  process.stdout.write(`${JSON.stringify(entry)}\n`)
}
