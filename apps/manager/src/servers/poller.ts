import { isDeepStrictEqual } from 'node:util'
import type { ListResult } from './list.js'

export type PollEvent = { type: 'servers', data: ListResult } | { type: 'error', message: string }

// One shared poll loop: runs while at least one subscriber is attached, never overlaps itself.
export function createPoller(poll: () => Promise<ListResult>, intervalMs: number) {
  const subs = new Set<(e: PollEvent) => void>()
  let timer: NodeJS.Timeout | undefined
  let last: PollEvent | undefined
  let busy = false

  const emit = (e: PollEvent) => {
    last = e
    for (const s of subs) s(e)
  }
  const tick = async () => {
    busy = true
    try {
      const data = await poll()
      if (!data.clusterOk) throw new Error(data.error ?? 'cluster unreachable')
      if (last?.type !== 'servers' || !isDeepStrictEqual(last.data, data)) emit({ type: 'servers', data })
    } catch (err) {
      if (last?.type !== 'error') emit({ type: 'error', message: (err as Error).message })
    }
    busy = false
    if (subs.size) timer = setTimeout(tick, intervalMs)
  }

  return {
    subscribe(fn: (e: PollEvent) => void) {
      subs.add(fn)
      if (subs.size === 1) {
        last = undefined
        if (!busy) timer = setTimeout(tick, 0)
      } else if (last) fn(last)
      return () => {
        subs.delete(fn)
        if (!subs.size) clearTimeout(timer)
      }
    },
  }
}
