import type { AuthConfig, AuthDeps } from '../../server/utils/auth-config'

const USERNAME = 'alice'
const PASSWORD = 'correct-horse'
// scrypt hash of PASSWORD, precomputed so tests do not depend on hashPassword.
const PASSWORD_HASH
  = 'scrypt$6+FdSb2JksIRa+Th27JXXQ==$xy4iW2HE4fSjlJ/ZkWLTM+cW82RWKQaXuf0e6GZFGbbAb3tt33A0gKnvc1xQT4nvSrYph3pFw1Uaiq5nOnPepw=='

export function testUsers() {
  return {
    username: USERNAME,
    password: PASSWORD,
    passwordHash: PASSWORD_HASH,
    json: JSON.stringify([{ username: USERNAME, passwordHash: PASSWORD_HASH }]),
  }
}

export function testConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    users: testUsers().json,
    idleTimeoutMs: 1800000,
    maxLifetimeMs: 43200000,
    maxFailures: 5,
    lockoutMs: 300000,
    trustProxy: false,
    ...overrides,
  }
}

export function fakeClock(start = 1_700_000_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => void (t += ms) }
}

export function testDeps(overrides: Partial<AuthConfig> = {}) {
  const clock = fakeClock()
  const deps: AuthDeps = { config: testConfig(overrides), now: clock.now }
  return { deps, clock }
}
