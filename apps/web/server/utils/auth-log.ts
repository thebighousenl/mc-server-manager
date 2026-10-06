const SECRET_FIELDS = ['password', 'passwordHash', 'token']

export interface AuthLogFields {
  level?: 'info' | 'warn' | 'error'
  username?: string
  ip?: string
}

// One JSON line per event to stdout; secrets are stripped even if a caller passes them.
export function authLog(event: string, fields: AuthLogFields = {}): void {
  const entry = Object.fromEntries(
    Object.entries({ level: 'info', ts: new Date().toISOString(), event, ...fields })
      .filter(([key]) => !SECRET_FIELDS.includes(key)),
  )
  process.stdout.write(`${JSON.stringify(entry)}\n`)
}
