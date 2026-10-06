export type Result<T> = { ok: true; value: T } | { ok: false; message: string }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = (message: string): Result<never> => ({ ok: false, message })

const RESERVED_NAMES = ['events', 'new', 'exports'] // collide with routes and pages

export function validateName(name: unknown): Result<string> {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{1,19}$/.test(name) || name.endsWith('-'))
    return fail('name must be 2-20 chars: lowercase letters, digits and dashes, starting with a letter, not ending with a dash')
  if (RESERVED_NAMES.includes(name)) return fail(`"${name}" is a reserved name`)
  return ok(name)
}

export function validatePort(port: unknown, o: { min: number; max: number; taken: Iterable<number> }): Result<number> {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < o.min || port > o.max)
    return fail(`port must be an integer between ${o.min} and ${o.max}`)
  if ([...o.taken].includes(port)) return fail(`port ${port} is already in use`)
  return ok(port)
}

const oneOf = (...values: string[]) => (v: string) => values.includes(v)
const intIn = (min: number, max: number) => (v: string) => /^\d{1,4}$/.test(v) && +v >= min && +v <= max
const bool = oneOf('true', 'false')
const xuids = /^\d{1,20}(,\d{1,20})*$/
const noControl = (v: string) => !/[\x00-\x1f\x7f]/.test(v)

const RULES: Record<string, [check: (v: string) => boolean, hint: string]> = {
  SERVER_NAME: [(v) => v.length >= 1 && v.length <= 64 && noControl(v), '1-64 chars, no control characters'],
  LEVEL_NAME: [(v) => /^[A-Za-z0-9 _.-]{1,64}$/.test(v) && !v.includes('..'), 'letters, digits, space, _ . - (1-64), no ".."'],
  GAMEMODE: [oneOf('survival', 'creative', 'adventure'), 'survival, creative or adventure'],
  DIFFICULTY: [oneOf('peaceful', 'easy', 'normal', 'hard'), 'peaceful, easy, normal or hard'],
  MAX_PLAYERS: [intIn(1, 200), 'an integer from 1 to 200'],
  ALLOW_CHEATS: [bool, 'true or false'],
  ONLINE_MODE: [bool, 'true or false'],
  ALLOW_LIST: [bool, 'true or false'],
  ALLOW_LIST_USERS: [
    (v) => v === '' || /^[A-Za-z0-9 _.-]{1,32}:\d{1,20}(,[A-Za-z0-9 _.-]{1,32}:\d{1,20})*$/.test(v),
    'name:xuid pairs separated by commas',
  ],
  OPS: [(v) => v === '' || xuids.test(v), 'xuids separated by commas'],
  DEFAULT_PLAYER_PERMISSION_LEVEL: [oneOf('visitor', 'member', 'operator'), 'visitor, member or operator'],
  VIEW_DISTANCE: [intIn(5, 96), 'an integer from 5 to 96'],
  TICK_DISTANCE: [intIn(4, 12), 'an integer from 4 to 12'],
  VERSION: [(v) => v === 'LATEST' || /^\d+(\.\d+){2,3}$/.test(v), 'LATEST or a dotted version such as 1.21.50.7'],
}
const CREATE_ONLY: typeof RULES = { LEVEL_SEED: [(v) => /^-?\d{1,20}$/.test(v), 'an integer'] }

export function validateSettings(settings: unknown, mode: 'create' | 'update'): Result<Record<string, string>> {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) return fail('settings must be an object')
  const rules = mode === 'create' ? { ...RULES, ...CREATE_ONLY } : RULES
  for (const [key, value] of Object.entries(settings)) {
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined
    if (!rule) return fail(`setting ${key} is not allowed${key in CREATE_ONLY ? ' after creation' : ''}`)
    if (typeof value !== 'string' || !rule[0](value)) return fail(`${key} must be ${rule[1]}`)
  }
  return ok(settings as Record<string, string>)
}

export function validateCommand(command: unknown): Result<string> {
  if (typeof command !== 'string' || command.length > 256 || /[\r\n\0]/.test(command))
    return fail('command must be 1-256 characters on one line')
  const trimmed = command.trim()
  return trimmed ? ok(trimmed) : fail('command must not be empty')
}

export function validateExportFile(file: unknown): Result<string> {
  if (typeof file !== 'string' || file.includes('..') || !/^[a-z][a-z0-9-]*-[A-Za-z0-9 _.-]+-\d{8}T\d{6}Z\.tgz$/.test(file))
    return fail('invalid export file name')
  return ok(file)
}
