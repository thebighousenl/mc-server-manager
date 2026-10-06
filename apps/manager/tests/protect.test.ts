import { describe, expect, it } from 'vitest'
import { PROTECTED_NAMES, isProtected } from '../src/servers/protect.js'

describe('PROTECTED_NAMES', () => {
  it('is exactly the five existing servers and frozen', () => {
    expect([...PROTECTED_NAMES]).toEqual(['gaitie', 'daan', 'kontgat', 'creative', 'plaskutje'])
    expect(Object.isFrozen(PROTECTED_NAMES)).toBe(true)
  })
})

describe('isProtected', () => {
  it.each(['gaitie', 'daan', 'kontgat', 'creative', 'plaskutje'])('protects %s even without labels', (name) => {
    expect(isProtected(name, {})).toBe(true)
  })

  it('protects any server labelled mc-manager/protected=true', () => {
    expect(isProtected('zz-test', { 'mc-manager/protected': 'true' })).toBe(true)
  })

  it('does not protect other servers', () => {
    expect(isProtected('zz-test', {})).toBe(false)
    expect(isProtected('zz-test', { 'mc-manager/protected': 'false' })).toBe(false)
    expect(isProtected('zz-test', { 'mc-manager/managed': 'true' })).toBe(false)
  })
})
