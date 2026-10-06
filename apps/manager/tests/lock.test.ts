import { describe, expect, it } from 'vitest'
import { TRAEFIK_LOCK, withLock } from '../src/servers/lock.js'

const tick = () => new Promise(r => setTimeout(r, 5))

describe('withLock', () => {
  it('serialises calls with the same key in call order', async () => {
    const log: string[] = []
    const job = (id: string) => withLock('daan', async () => {
      log.push(`start ${id}`)
      await tick()
      log.push(`end ${id}`)
      return id
    })
    expect(await Promise.all([job('a'), job('b'), job('c')])).toEqual(['a', 'b', 'c'])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  })

  it('runs different keys concurrently', async () => {
    const log: string[] = []
    const job = (key: string) => withLock(key, async () => {
      log.push(`start ${key}`)
      await tick()
      log.push(`end ${key}`)
    })
    await Promise.all([job('a'), job('b')])
    expect(log).toEqual(['start a', 'start b', 'end a', 'end b'])
  })

  it('releases on throw and propagates the error', async () => {
    await expect(withLock('x', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await withLock('x', async () => 'next')).toBe('next')
  })

  it('the traefik key is shared by all callers', async () => {
    expect(TRAEFIK_LOCK).toBe('traefik')
    const log: string[] = []
    const job = (id: string) => withLock(TRAEFIK_LOCK, async () => {
      log.push(`start ${id}`)
      await tick()
      log.push(`end ${id}`)
    })
    await Promise.all([job('create'), job('delete')])
    expect(log).toEqual(['start create', 'end create', 'start delete', 'end delete'])
  })
})
