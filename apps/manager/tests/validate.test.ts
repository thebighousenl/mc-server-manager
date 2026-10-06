import { describe, expect, it } from 'vitest'
import {
  validateCommand, validateExportFile, validateName, validatePort, validateSettings,
} from '../src/servers/validate.js'

const ok = (value: unknown) => ({ ok: true, value })
const bad = { ok: false, message: expect.any(String) }

describe('validateName', () => {
  it.each(['daan', 'ab', 'zz-test', 'a'.repeat(20), 'a1-b2'])('accepts %s', (n) => expect(validateName(n)).toEqual(ok(n)))
  it.each([
    'Daan', 'a', '1abc', 'a b', 'a..b', 'abc-', 'a'.repeat(21), '', 'a/b', '../x', 'events', 'new', 'exports',
  ])('rejects %j', (n) => expect(validateName(n)).toMatchObject(bad))
  it('rejects non-strings', () => expect(validateName(5)).toMatchObject(bad))
})

describe('validatePort', () => {
  const o = { min: 19132, max: 19999, taken: [19140] }
  it('accepts a free in-range port', () => expect(validatePort(19200, o)).toEqual(ok(19200)))
  it.each([19131, 20000, 19140, 19200.5, '19200', NaN])('rejects %j', (p) => expect(validatePort(p, o)).toMatchObject(bad))
})

describe('validateSettings', () => {
  it.each([
    ['GAMEMODE', 'creative'], ['DIFFICULTY', 'hard'], ['MAX_PLAYERS', '1'], ['MAX_PLAYERS', '200'],
    ['ALLOW_CHEATS', 'true'], ['ONLINE_MODE', 'false'], ['ALLOW_LIST', 'true'],
    ['ALLOW_LIST_USERS', 'Steve:2535400000000001,Alex:2535400000000002'], ['OPS', '2535400000000001,2535400000000002'],
    ['DEFAULT_PLAYER_PERMISSION_LEVEL', 'member'], ['VIEW_DISTANCE', '32'], ['TICK_DISTANCE', '6'],
    ['VERSION', 'LATEST'], ['VERSION', '1.21.50.07'], ['VERSION', '1.21.50'], ['LEVEL_NAME', 'My World_1.0'],
    ['SERVER_NAME', 'My server'],
  ])('accepts %s=%s', (k, v) => {
    expect(validateSettings({ [k]: v }, 'update')).toEqual(ok({ [k]: v }))
  })

  it.each([
    ['GAMEMODE', 'hardcore'], ['MAX_PLAYERS', '0'], ['MAX_PLAYERS', '201'], ['MAX_PLAYERS', 'ten'], ['ALLOW_CHEATS', 'yes'],
    ['ALLOW_LIST_USERS', 'Steve'], ['ALLOW_LIST_USERS', 'Steve:abc'], ['OPS', 'steve'], ['VERSION', 'latest'], ['VERSION', '1.21'],
    ['LEVEL_NAME', '../x'], ['LEVEL_NAME', ''], ['SERVER_NAME', ''], ['SERVER_NAME', 'a\nb'], ['SERVER_NAME', 'x'.repeat(65)],
    ['DIFFICULTY', 'impossible'], ['MAX_PLAYERS', 20],
  ])('rejects %s=%j', (k, v) => {
    expect(validateSettings({ [k]: v }, 'update')).toMatchObject(bad)
  })

  it.each(['EULA', 'TRANSPORT', 'UNKNOWN', 'PATH'])('rejects key %s', (k) => {
    expect(validateSettings({ [k]: 'x' }, 'create')).toMatchObject(bad)
    expect(validateSettings({ [k]: 'TRUE' }, 'update')).toMatchObject(bad)
  })

  it('LEVEL_SEED only in create mode', () => {
    expect(validateSettings({ LEVEL_SEED: '12345' }, 'create')).toEqual(ok({ LEVEL_SEED: '12345' }))
    expect(validateSettings({ LEVEL_SEED: '12345' }, 'update')).toMatchObject(bad)
  })

  it('rejects non-objects', () => {
    expect(validateSettings(null, 'update')).toMatchObject(bad)
    expect(validateSettings([], 'update')).toMatchObject(bad)
  })
})

describe('validateCommand', () => {
  it('trims and accepts', () => expect(validateCommand('  say hi  ')).toEqual(ok('say hi')))
  it('accepts 256 chars', () => expect(validateCommand('a'.repeat(256))).toMatchObject({ ok: true }))
  it.each(['', '   ', 'a'.repeat(257), 'say\nhi', 'say\rhi', 'say\0hi', 7])('rejects %j', (c) => {
    expect(validateCommand(c)).toMatchObject(bad)
  })
})

describe('validateExportFile', () => {
  it('accepts a generated name', () => {
    const f = 'daan-My World_1.0-20260101T120000Z.tgz'
    expect(validateExportFile(f)).toEqual(ok(f))
  })
  it.each([
    '../daan-w-20260101T120000Z.tgz', 'daan/w-20260101T120000Z.tgz', 'daan-w-20260101T120000Z.tar', 'Daan-w-20260101T120000Z.tgz',
    'daan-..-20260101T120000Z.tgz', 'daan-w-2026.tgz', '', 5,
  ])('rejects %j', (f) => expect(validateExportFile(f)).toMatchObject(bad))
})
