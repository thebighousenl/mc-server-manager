import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export interface Operator {
  username: string
  passwordHash: string
}

const KEY_LEN = 64
const B64 = /^[A-Za-z0-9+/]+={0,2}$/
const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key))),
  )

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`
}

const isHash = (h: unknown): h is string => {
  if (typeof h !== 'string') return false
  const [scheme, salt, hash, ...rest] = h.split('$')
  return scheme === 'scrypt' && !rest.length && !!salt && !!hash && B64.test(salt) && B64.test(hash)
    && Buffer.from(hash, 'base64').length === KEY_LEN
}

// Never throws: any malformed hash is simply "not a match".
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (!isHash(stored)) return false
    const [, salt, hash] = stored.split('$') as [string, string, string]
    return timingSafeEqual(await derive(password, Buffer.from(salt, 'base64')), Buffer.from(hash, 'base64'))
  }
  catch {
    return false
  }
}

// Equalises timing for unknown usernames.
export async function dummyVerify(): Promise<false> {
  await derive('dummy', Buffer.alloc(16))
  return false
}

const validEntry = (u: unknown) => {
  const { username, passwordHash } = (u ?? {}) as Record<string, unknown>
  return typeof username === 'string' && username.length >= 1 && username.length <= 64 && isHash(passwordHash)
    ? { username: username.toLowerCase(), passwordHash }
    : undefined
}

export function parseUsers(json: string): Operator[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  }
  catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const users: Operator[] = []
  for (const u of raw) {
    const op = validEntry(u)
    if (op && !users.some(x => x.username === op.username)) users.push(op) // first wins
  }
  return users
}

// Startup diagnostics for NUXT_AUTH_USERS. Messages never echo the raw value or any hash.
// Unset/empty is not a misconfiguration here: it is reported as no_operators_configured.
export function configProblems(json: string): string[] {
  if (!json.trim()) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  }
  catch {
    return ['NUXT_AUTH_USERS is not valid JSON (expected [{"username":"...","passwordHash":"scrypt$<salt>$<hash>"}])']
  }
  if (!Array.isArray(raw)) return ['NUXT_AUTH_USERS must be a JSON array']
  return raw.flatMap((u, i) => validEntry(u)
    ? []
    : [`NUXT_AUTH_USERS entry ${i} has no valid username/passwordHash (expected scrypt$<salt>$<hash>)`])
}
