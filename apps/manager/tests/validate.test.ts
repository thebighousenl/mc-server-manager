import { describe, expect, it } from 'vitest'
import {
  validateCommand,
  validateExportFile,
  validateName,
  validatePort,
  validateSettings,
} from '../src/servers/validate.js'

const ok = (value: unknown) => ({ ok: true, value })
const bad = expect.objectContaining({ ok: false, message: expect.any(String) })

describe('validateName', () => {
  it.each(['daan', 'zz-test', 'ab', 'a'.repeat(20), 'a1-b2'])('accepts %s', (n) => {
    expect(validateName(n)).toEqual(ok(n))
  })

  it.each([
    ['uppercase', 'Daan'],
    ['space', 'my server'],
    ['dots', 'a..b'],
    ['traversal', '../etc'],
    ['trailing dash', 'abc-'],
    ['21 chars', 'a'.repeat(21)],
    ['one char', 'a'],
    ['leading digit', '1abc'],
    ['leading dash', '-abc'],
    ['empty', ''],
    ['slash', 'a/b'],
    ['reserved events', 'events'],
    ['reserved new', 'new'],
    ['reserved exports', 'exports'],
  ])('rejects %s', (_, n) => {
    expect(validateName(n)).toEqual(bad)
  })

  it('rejects non-strings', () => {
    expect(validateName(42)).toEqual(bad)
    expect(validateName(undefined)).toEqual(bad)
  })
})

describe('validatePort', () => {
  const opts = { min: 19132, max: 19999, taken: [19133] }

  it('accepts a free port in range, including the bounds', () => {
    expect(validatePort(19134, opts)).toEqual(ok(19134))
    expect(validatePort(19132, opts)).toEqual(ok(19132))
    expect(validatePort(19999, opts)).toEqual(ok(19999))
  })

  it('rejects out of range, non-integer and non-number', () => {
    expect(validatePort(19131, opts)).toEqual(bad)
    expect(validatePort(20000, opts)).toEqual(bad)
    expect(validatePort(19140.5, opts)).toEqual(bad)
    expect(validatePort('19140', opts)).toEqual(bad)
    expect(validatePort(Number.NaN, opts)).toEqual(bad)
  })

  it('rejects a taken port', () => {
    expect(validatePort(19133, opts)).toEqual(bad)
  })
})

describe('validateSettings', () => {
  const good = {
    SERVER_NAME: 'My Server',
    LEVEL_NAME: 'Bedrock level',
    GAMEMODE: 'survival',
    DIFFICULTY: 'hard',
    MAX_PLAYERS: '20',
    ALLOW_CHEATS: 'false',
    ONLINE_MODE: 'true',
    ALLOW_LIST: 'true',
    ALLOW_LIST_USERS: 'Steve:2535400000000001,Alex Q:2535400000000002',
    OPS: '2535400000000001,2535400000000002',
    DEFAULT_PLAYER_PERMISSION_LEVEL: 'member',
    VIEW_DISTANCE: '10',
    TICK_DISTANCE: '4',
    VERSION: '1.21.50.7',
  }

  it('accepts every allow-listed key with a valid value, in both modes', () => {
    expect(validateSettings(good, 'create')).toEqual(ok(good))
    expect(validateSettings(good, 'update')).toEqual(ok(good))
  })

  it('accepts an empty partial and VERSION=LATEST', () => {
    expect(validateSettings({}, 'update')).toEqual(ok({}))
    expect(validateSettings({ VERSION: 'LATEST' }, 'update')).toEqual(ok({ VERSION: 'LATEST' }))
  })

  it('accepts empty ALLOW_LIST_USERS and OPS to clear them', () => {
    expect(validateSettings({ ALLOW_LIST_USERS: '', OPS: '' }, 'update').ok).toBe(true)
  })

  it.each([
    ['GAMEMODE', 'hardcore'],
    ['DIFFICULTY', 'brutal'],
    ['MAX_PLAYERS', '0'],
    ['MAX_PLAYERS', '201'],
    ['MAX_PLAYERS', '1.5'],
    ['MAX_PLAYERS', 'ten'],
    ['ALLOW_CHEATS', 'yes'],
    ['ONLINE_MODE', 'TRUE'],
    ['ALLOW_LIST', '1'],
    ['ALLOW_LIST_USERS', 'Steve'],
    ['ALLOW_LIST_USERS', 'Steve:abc'],
    ['ALLOW_LIST_USERS', 'Steve:1,'],
    ['OPS', 'steve'],
    ['OPS', '1,,2'],
    ['DEFAULT_PLAYER_PERMISSION_LEVEL', 'admin'],
    ['VIEW_DISTANCE', 'far'],
    ['TICK_DISTANCE', '-1'],
    ['VERSION', 'latest'],
    ['VERSION', '1.21'],
    ['VERSION', '1.21.x'],
    ['VERSION', '1.2.3.4.5'],
    ['LEVEL_NAME', 'a/b'],
    ['LEVEL_NAME', '..'.padEnd(65, 'a')],
    ['LEVEL_NAME', ''],
    ['SERVER_NAME', ''],
    ['SERVER_NAME', 'a'.repeat(65)],
    ['SERVER_NAME', 'bad\nname'],
  ])('rejects %s=%j', (key, value) => {
    expect(validateSettings({ [key]: value }, 'update')).toEqual(bad)
  })

  it('rejects unknown keys, EULA and TRANSPORT', () => {
    for (const key of ['FOO', 'EULA', 'TRANSPORT', 'level_name']) {
      const r = validateSettings({ [key]: 'x' }, 'create')
      expect(r).toEqual(bad)
      expect(r.ok === false && r.message).toContain(key)
    }
  })

  it('rejects non-string values and non-object input', () => {
    expect(validateSettings({ MAX_PLAYERS: 20 }, 'update')).toEqual(bad)
    expect(validateSettings(null, 'update')).toEqual(bad)
    expect(validateSettings([], 'update')).toEqual(bad)
  })

  it('accepts LEVEL_SEED only in create mode', () => {
    expect(validateSettings({ LEVEL_SEED: '12345' }, 'create')).toEqual(ok({ LEVEL_SEED: '12345' }))
    expect(validateSettings({ LEVEL_SEED: '12345' }, 'update')).toEqual(bad)
  })
})

describe('validateCommand', () => {
  it('accepts and trims', () => {
    expect(validateCommand('list')).toEqual(ok('list'))
    expect(validateCommand('  say hi  ')).toEqual(ok('say hi'))
    expect(validateCommand('a'.repeat(256))).toEqual(ok('a'.repeat(256)))
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['257 chars', 'a'.repeat(257)],
    ['newline', 'say a\nstop'],
    ['carriage return', 'say a\rstop'],
    ['NUL', 'say a\0'],
    ['non-string', 5],
  ])('rejects %s', (_, c) => {
    expect(validateCommand(c)).toEqual(bad)
  })
})

describe('validateExportFile', () => {
  it.each(['daan-Bedrock level-20261006T120000Z.tgz', 'zz-test-world_1.0-20261006T120000Z.tgz'])('accepts %s', (f) => {
    expect(validateExportFile(f)).toEqual(ok(f))
  })

  it.each([
    ['no timestamp', 'daan-world.tgz'],
    ['wrong extension', 'daan-world-20261006T120000Z.zip'],
    ['slash', 'daan-a/b-20261006T120000Z.tgz'],
    ['traversal', '../daan-world-20261006T120000Z.tgz'],
    ['dotdot in level', 'daan-a..b-20261006T120000Z.tgz'],
    ['uppercase server', 'Daan-world-20261006T120000Z.tgz'],
    ['non-string', undefined],
  ])('rejects %s', (_, f) => {
    expect(validateExportFile(f)).toEqual(bad)
  })
})
