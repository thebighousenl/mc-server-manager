// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDeps } from './helpers/auth'

type Throttle = typeof import('../server/utils/throttle')
let t: Throttle
beforeEach(async () => {
  vi.resetModules()
  t = await import('../server/utils/throttle')
})

describe('throttle', () => {
  it('locks on the 5th failure (maxFailures 5)', () => {
    const { deps } = testDeps()
    for (let i = 0; i < 4; i++) t.recordFailure('user:alice', deps)
    expect(t.isLocked('user:alice', deps)).toBe(false)
    t.recordFailure('user:alice', deps)
    expect(t.isLocked('user:alice', deps)).toBe(true)
  })

  it('stays locked until lockoutMs passes, then unlocks', () => {
    const { deps, clock } = testDeps({ lockoutMs: 10_000 })
    for (let i = 0; i < 5; i++) t.recordFailure('user:alice', deps)
    clock.advance(9_999)
    expect(t.isLocked('user:alice', deps)).toBe(true)
    expect(t.retryAfterSeconds('user:alice', deps)).toBe(1)
    clock.advance(2)
    expect(t.isLocked('user:alice', deps)).toBe(false)
  })

  it('retryAfterSeconds rounds up the remaining lockout', () => {
    const { deps, clock } = testDeps({ lockoutMs: 300_000 })
    for (let i = 0; i < 5; i++) t.recordFailure('ip:1.1.1.1', deps)
    expect(t.retryAfterSeconds('ip:1.1.1.1', deps)).toBe(300)
    clock.advance(1_500)
    expect(t.retryAfterSeconds('ip:1.1.1.1', deps)).toBe(299)
  })

  it('counts failures only within the lockoutMs window', () => {
    const { deps, clock } = testDeps({ lockoutMs: 10_000 })
    for (let i = 0; i < 4; i++) t.recordFailure('user:alice', deps)
    clock.advance(10_001) // window elapsed: counter restarts
    t.recordFailure('user:alice', deps)
    expect(t.isLocked('user:alice', deps)).toBe(false)
  })

  it('lockout lasts a full lockoutMs from the locking failure', () => {
    const { deps, clock } = testDeps({ lockoutMs: 10_000 })
    for (let i = 0; i < 4; i++) t.recordFailure('user:alice', deps)
    clock.advance(9_000)
    t.recordFailure('user:alice', deps) // locks now
    clock.advance(9_999)
    expect(t.isLocked('user:alice', deps)).toBe(true)
    clock.advance(2)
    expect(t.isLocked('user:alice', deps)).toBe(false)
  })

  it('sweeps expired entries when new failures are recorded', () => {
    const { deps, clock } = testDeps({ lockoutMs: 10_000 })
    t.recordFailure('user:old', deps)
    clock.advance(20_001)
    t.recordFailure('user:new', deps)
    expect(t.size()).toBe(1)
  })

  it('recordSuccess clears the key', () => {
    const { deps } = testDeps()
    for (let i = 0; i < 4; i++) t.recordFailure('user:alice', deps)
    t.recordSuccess('user:alice')
    t.recordFailure('user:alice', deps)
    expect(t.isLocked('user:alice', deps)).toBe(false)
  })

  it('user and ip keys are independent', () => {
    const { deps } = testDeps()
    for (let i = 0; i < 5; i++) t.recordFailure('user:alice', deps)
    expect(t.isLocked('user:alice', deps)).toBe(true)
    expect(t.isLocked('ip:alice', deps)).toBe(false)
    expect(t.isLocked('user:bob', deps)).toBe(false)
  })

  it('an unknown key is not locked', () => {
    const { deps } = testDeps()
    expect(t.isLocked('user:nobody', deps)).toBe(false)
    expect(t.retryAfterSeconds('user:nobody', deps)).toBe(0)
  })
})
