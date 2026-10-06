import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller } from '../src/servers/poller.js'

const list = (state: string) => ({ servers: [{ name: 'daan', state }], clusterOk: true })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('poller', () => {
  it('polls once for many subscribers, starts with the first and stops after the last', async () => {
    const poll = vi.fn(async () => list('running'))
    const poller = createPoller(poll, 3000)
    expect(poll).not.toHaveBeenCalled()
    const a = poller.subscribe(() => {})
    const b = poller.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(poll).toHaveBeenCalledTimes(2)
    a()
    await vi.advanceTimersByTimeAsync(3000)
    expect(poll).toHaveBeenCalledTimes(3)
    b()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('emits only when the list changed, and gives a late subscriber the latest list', async () => {
    let state = 'running'
    const poller = createPoller(async () => list(state), 3000)
    const seen: unknown[] = []
    poller.subscribe(e => seen.push(e))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(3000)
    expect(seen).toEqual([{ type: 'servers', data: list('running') }])
    state = 'stopped'
    await vi.advanceTimersByTimeAsync(3000)
    expect(seen).toHaveLength(2)
    const late: unknown[] = []
    poller.subscribe(e => late.push(e))
    expect(late).toEqual([{ type: 'servers', data: list('stopped') }])
  })

  it('emits error once for a failing poll and keeps retrying', async () => {
    let fail = true
    const poll = vi.fn(async () => { if (fail) throw new Error('boom'); return list('running') })
    const poller = createPoller(poll, 3000)
    const seen: { type: string }[] = []
    poller.subscribe(e => seen.push(e))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(6000)
    expect(poll).toHaveBeenCalledTimes(3)
    expect(seen.map(e => e.type)).toEqual(['error'])
    fail = false
    await vi.advanceTimersByTimeAsync(3000)
    expect(seen.map(e => e.type)).toEqual(['error', 'servers'])
  })

  it('does not overlap polls', async () => {
    let running = 0
    let max = 0
    const poller = createPoller(async () => {
      max = Math.max(max, ++running)
      await new Promise(r => setTimeout(r, 5000))
      running--
      return list('running')
    }, 3000)
    poller.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(20_000)
    expect(max).toBe(1)
  })
})
