// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { configProblems, dummyVerify, hashPassword, parseUsers, verifyPassword } from '../server/utils/password'
import { testUsers } from './helpers/auth'

describe('password hashing', () => {
  it('hashPassword outputs scrypt$<salt>$<hash>', async () => {
    expect(await hashPassword('pw')).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
  })

  it('uses a fresh salt each time', async () => {
    expect(await hashPassword('pw')).not.toBe(await hashPassword('pw'))
  })

  it('verifyPassword is true for the right password, false for a wrong one', async () => {
    const hash = await hashPassword('s3cret')
    expect(await verifyPassword('s3cret', hash)).toBe(true)
    expect(await verifyPassword('nope', hash)).toBe(false)
  })

  it('verifies the precomputed test hash', async () => {
    const u = testUsers()
    expect(await verifyPassword(u.password, u.passwordHash)).toBe(true)
  })

  it.each(['', 'garbage', 'scrypt$only', 'scrypt$$', 'bcrypt$a$b', 'scrypt$%%%$%%%'])(
    'malformed hash %j -> false, never throws',
    async (bad) => {
      expect(await verifyPassword('pw', bad)).toBe(false)
    },
  )

  it('dummyVerify resolves false', async () => {
    expect(await dummyVerify()).toBe(false)
  })
})

describe('parseUsers', () => {
  const { passwordHash } = testUsers()

  it('returns valid operators with lower-cased usernames', () => {
    const json = JSON.stringify([{ username: 'Alice', passwordHash }])
    expect(parseUsers(json)).toEqual([{ username: 'alice', passwordHash }])
  })

  it('ignores malformed hashes and invalid entries', () => {
    const json = JSON.stringify([
      { username: 'bad', passwordHash: 'plaintext' },
      { username: '', passwordHash },
      { username: 'x'.repeat(65), passwordHash },
      { passwordHash },
      null,
      { username: 'ok', passwordHash },
    ])
    expect(parseUsers(json).map(u => u.username)).toEqual(['ok'])
  })

  it('keeps only the first of duplicate or case-variant usernames', () => {
    const other = testUsers().passwordHash.replace('6+Fd', '7+Fd')
    const json = JSON.stringify([
      { username: 'Alice', passwordHash },
      { username: 'alice', passwordHash: other },
    ])
    expect(parseUsers(json)).toEqual([{ username: 'alice', passwordHash }])
  })

  it.each(['', 'not json', '{}', '"str"', 'null'])('%j -> []', (input) => {
    expect(parseUsers(input)).toEqual([])
  })
})

describe('configProblems', () => {
  const { passwordHash } = testUsers()

  it('accepts valid, empty and unset values', () => {
    expect(configProblems(JSON.stringify([{ username: 'alice', passwordHash }]))).toEqual([])
    expect(configProblems('')).toEqual([])
    expect(configProblems('[]')).toEqual([])
  })

  it('reports invalid JSON without echoing the value', () => {
    const raw = '[{ "dev", "GFI+r5qqKZIr+j0DVBXIHHXDhdDKhUjhUgrl8JPqryxo0dh7Yjc3Txth3JVZrWBPiVDnyGE2HzKWfgHxN3GwKA==" }]'
    const [msg, ...more] = configProblems(raw)
    expect(more).toEqual([])
    expect(msg).toContain('not valid JSON')
    expect(msg).not.toContain('GFI+')
  })

  it.each(['{}', '"str"', 'null'])('%s -> must be an array', (input) => {
    expect(configProblems(input)).toEqual(['NUXT_AUTH_USERS must be a JSON array'])
  })

  it('names the malformed entry index and never leaks the hash', () => {
    const bad = 'scrypt$not-a-valid-hash$SECRETHASHVALUE'
    const problems = configProblems(JSON.stringify([
      { username: 'ok', passwordHash },
      { username: 'bad', passwordHash: bad },
      null,
    ]))
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('entry 1 has no valid username/passwordHash')
    expect(problems[1]).toContain('entry 2')
    expect(problems.join()).not.toContain('SECRETHASHVALUE')
    expect(problems.join()).not.toContain(passwordHash)
  })
})
