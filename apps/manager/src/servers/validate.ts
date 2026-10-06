export type Result<T> = { ok: true, value: T } | { ok: false, message: string }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const bad = (message: string): Result<never> => ({ ok: false, message })

const RESERVED = ['events', 'new', 'exports']

export function validateName(name: unknown): Result<string> {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{1,19}$/.test(name) || name.endsWith('-')) {
    return bad('name must be 2-20 characters: lowercase letters, digits and dashes, starting with a letter, not ending with a dash')
  }
  return RESERVED.includes(name) ? bad(`name "${name}" is reserved`) : ok(name)
}

export function validatePort(port: unknown, o: { min: number, max: number, taken: number[] }): Result<number> {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < o.min || port > o.max) {
    return bad(`port must be an integer between ${o.min} and ${o.max}`)
  }
  return o.taken.includes(port) ? bad(`port ${port} is already in use`) : ok(port)
}

const intIn = (min: number, max: number) => (v: string) => /^\d{1,4}$/.test(v) && +v >= min && +v <= max
const oneOf = (...values: string[]) => (v: string) => values.includes(v)
const bool = oneOf('true', 'false')
const text = (max: number) => (v: string) => v.length >= 1 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v) // eslint-disable-line no-control-regex

// Allow-list of editable settings (data-model.md, ServerSettings). Everything else is read-only.
const RULES: Record<string, (v: string) => boolean> = {
  SERVER_NAME: text(64),
  LEVEL_NAME: v => /^[A-Za-z0-9 _.-]{1,64}$/.test(v),
  GAMEMODE: oneOf('survival', 'creative', 'adventure'),
  DIFFICULTY: oneOf('peaceful', 'easy', 'normal', 'hard'),
  MAX_PLAYERS: intIn(1, 200),
  ALLOW_CHEATS: bool,
  ONLINE_MODE: bool,
  ALLOW_LIST: bool,
  ALLOW_LIST_USERS: v => /^[^:,\s][^:,]{0,31}:\d+(,[^:,\s][^:,]{0,31}:\d+)*$/.test(v),
  OPS: v => /^\d+(,\d+)*$/.test(v),
  DEFAULT_PLAYER_PERMISSION_LEVEL: oneOf('visitor', 'member', 'operator'),
  VIEW_DISTANCE: intIn(5, 96),
  TICK_DISTANCE: intIn(4, 12),
  VERSION: v => v === 'LATEST' || /^\d+(\.\d+){2,3}$/.test(v),
}
const CREATE_ONLY: Record<string, (v: string) => boolean> = { LEVEL_SEED: text(64) }

export const isEditable = (key: string) => key in RULES

export function validateSettings(partial: unknown, mode: 'create' | 'update'): Result<Record<string, string>> {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return bad('settings must be an object')
  const rules = mode === 'create' ? { ...RULES, ...CREATE_ONLY } : RULES
  for (const [key, value] of Object.entries(partial)) {
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined
    if (!rule) return bad(`setting ${key} is not editable`)
    if (typeof value !== 'string' || !rule(value)) return bad(`invalid value for ${key}`)
  }
  return ok({ ...partial } as Record<string, string>)
}

export function validateCommand(command: unknown): Result<string> {
  if (typeof command !== 'string') return bad('command must be a string')
  const c = command.trim()
  if (c.length < 1 || c.length > 256 || /[\r\n\0]/.test(c)) return bad('command must be 1-256 characters on a single line')
  return ok(c)
}

export function validateExportFile(file: unknown): Result<string> {
  if (typeof file !== 'string' || !/^[a-z][a-z0-9-]*-[A-Za-z0-9 _.-]+-\d{8}T\d{6}Z\.tgz$/.test(file) || file.includes('..')) {
    return bad('invalid export file name')
  }
  return ok(file)
}
