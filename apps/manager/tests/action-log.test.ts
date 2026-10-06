import { describe, expect, it } from 'vitest'
import { logAction } from '../src/servers/action-log.js'

const capture = () => {
  const records: Record<string, unknown>[] = []
  return { records, logger: { info: (o: Record<string, unknown>) => void records.push(o) } }
}
const base = { operator: 'alice', server: 'daan', action: 'stop', outcome: 'ok' }

describe('logAction', () => {
  it('emits one record with exactly the fields plus time', () => {
    const { records, logger } = capture()
    logAction(logger, { ...base, detail: 'done' })
    expect(records).toHaveLength(1)
    expect(Object.keys(records[0]!).sort()).toEqual(['action', 'detail', 'operator', 'outcome', 'server', 'time'])
    expect(records[0]).toMatchObject({ ...base, detail: 'done' })
    expect(typeof records[0]!.time).toBe('string')
  })

  it('never emits secret-looking keys', () => {
    const { records, logger } = capture()
    logAction(logger, { ...base, token: 't', secret: 's', kubeconfig: 'k', password: 'p' } as never)
    for (const k of ['token', 'secret', 'kubeconfig', 'password']) expect(records[0]).not.toHaveProperty(k)
  })

  it('truncates detail to 200 chars', () => {
    const { records, logger } = capture()
    logAction(logger, { ...base, detail: 'x'.repeat(500) })
    expect((records[0]!.detail as string).length).toBe(200)
  })

  it('omits detail when absent', () => {
    const { records, logger } = capture()
    logAction(logger, base)
    expect(records[0]).not.toHaveProperty('detail')
  })
})
