import { describe, expect, it } from 'vitest'
import { PROTECTED_NAMES, isProtected } from '../src/servers/protect.js'

describe('protect', () => {
  it('PROTECTED_NAMES is exactly the five servers and frozen', () => {
    expect([...PROTECTED_NAMES]).toEqual(['gaitie', 'daan', 'kontgat', 'creative', 'plaskutje'])
    expect(Object.isFrozen(PROTECTED_NAMES)).toBe(true)
  })

  it.each(['gaitie', 'daan', 'kontgat', 'creative', 'plaskutje'])('%s is protected even without labels', (n) => {
    expect(isProtected(n, {})).toBe(true)
    expect(isProtected(n, undefined)).toBe(true)
  })

  it('the protected label protects any server', () => {
    expect(isProtected('zz-test', { 'mc-manager/protected': 'true' })).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isProtected('zz-test', {})).toBe(false)
    expect(isProtected('zz-test', { 'mc-manager/protected': 'false' })).toBe(false)
  })
})
