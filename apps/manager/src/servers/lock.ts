// Special key for the shared Traefik HelmChartConfig; anything that edits it takes this lock.
export const TRAEFIK_LOCK = 'traefik'

const tails = new Map<string, Promise<unknown>>()

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (tails.get(key) ?? Promise.resolve()).then(fn)
  const tail = run.catch(() => {})
  tails.set(key, tail)
  void tail.then(() => { if (tails.get(key) === tail) tails.delete(key) })
  return run
}
