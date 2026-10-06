import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { KubectlError } from '../src/kube/kubectl.js'
import { addPort, applyTraefik, nextFreePort, removePort, TraefikError, type TraefikValues } from '../src/kube/traefik.js'
import { PROTECTED_NAMES } from '../src/servers/protect.js'
import { fakeKubectl, fixture } from './helpers/fake-kubectl.js'

const config = (): { spec: { valuesContent: string } } => fixture('helmchartconfig-traefik')
const values = () => parse(config().spec.valuesContent) as TraefikValues
const FIVE = [19332, 19132, 19134, 19232, 19140]

describe('addPort / removePort / nextFreePort', () => {
  it('has the five real entries in the fixture', () => {
    expect(Object.values(values().ports).map(p => p.exposedPort).sort()).toEqual([...FIVE].sort())
  })

  it('appends mc-<name> and leaves the five existing entries deep-equal', () => {
    const before = values()
    const after = addPort(before, 'zz', 19300)
    expect(after.ports['mc-zz']).toEqual({ port: 19300, exposedPort: 19300, protocol: 'UDP', expose: { default: true } })
    for (const [k, v] of Object.entries(values().ports)) expect(after.ports[k]).toEqual(v)
    expect(Object.keys(after.ports)).toHaveLength(6)
    expect(before).toEqual(values()) // input not mutated
  })

  it('rejects a duplicate name or a used port', () => {
    expect(() => addPort(values(), 'daan', 19300)).toThrow(TraefikError)
    expect(() => addPort(values(), 'zz', 19134)).toThrow(TraefikError)
  })

  it('removes only that entry', () => {
    const after = removePort(addPort(values(), 'zz', 19300), 'zz')
    expect(after).toEqual(values())
  })

  it.each(PROTECTED_NAMES)('refuses to remove protected %s', (name) => {
    expect(() => removePort(values(), name)).toThrow(TraefikError)
  })

  it('refuses to remove an unknown name', () => {
    expect(() => removePort(values(), 'nope')).toThrow(TraefikError)
  })

  it('nextFreePort skips used ports within min/max', () => {
    expect(nextFreePort(values(), 19132, 19999)).toBe(19133)
    expect(nextFreePort(addPort(values(), 'a', 19133), 19132, 19999)).toBe(19135)
    expect(() => nextFreePort(values(), 19132, 19132)).toThrow(TraefikError)
  })
})

function cluster(o: { dryRunFails?: boolean, conflict?: boolean } = {}) {
  return fakeKubectl([
    { match: a => a[0] === 'get' && a[1] === 'helmchartconfig', result: { stdout: JSON.stringify(config()) } },
    {
      match: a => a[0] === 'apply',
      result: () => {
        if (o.dryRunFails) throw new KubectlError('failed')
        return { stdout: '' }
      },
    },
    {
      match: a => a[0] === 'replace',
      result: () => {
        if (o.conflict) throw new KubectlError('conflict')
        return { stdout: '' }
      },
    },
  ])
}
const writes = (k: ReturnType<typeof cluster>) => k.calls.filter(a => a[0] === 'replace')

describe('applyTraefik', () => {
  it('reads, dry-runs, then writes with the read resourceVersion; output parses back to the same ports', async () => {
    const k = cluster()
    const result = await applyTraefik(k, v => addPort(v, 'zz', 19300))
    expect(k.calls.map(a => a[0])).toEqual(['get', 'apply', 'replace'])
    expect(k.calls[1]).toContain('--dry-run=server')
    expect(k.calls[2]).not.toContain('--dry-run=server')
    const sent = JSON.parse(k.stdins[2]!)
    expect(sent.metadata.resourceVersion).toBe('4242')
    expect(parse(sent.spec.valuesContent)).toEqual(result)
    expect(parse(sent.spec.valuesContent).ports['mc-zz'].exposedPort).toBe(19300)
    expect(Object.keys(parse(sent.spec.valuesContent).ports)).toHaveLength(6)
  })

  it('aborts without writing when the dry run fails', async () => {
    const k = cluster({ dryRunFails: true })
    await expect(applyTraefik(k, v => addPort(v, 'zz', 19300))).rejects.toBeInstanceOf(KubectlError)
    expect(writes(k)).toHaveLength(0)
  })

  it('aborts without any apply or write when a non-target entry changed', async () => {
    const k = cluster()
    await expect(applyTraefik(k, (v) => {
      const next = addPort(v, 'zz', 19300)
      next.ports['mc-daan'] = { ...next.ports['mc-daan']!, exposedPort: 19999 }
      return next
    })).rejects.toBeInstanceOf(TraefikError)
    expect(k.calls.filter(a => a[0] !== 'get')).toHaveLength(0)
  })

  it('aborts when a second entry is dropped or other top-level values change', async () => {
    const k = cluster()
    await expect(applyTraefik(k, v => ({ ports: Object.fromEntries(Object.entries(v.ports).slice(2)) }))).rejects.toBeInstanceOf(TraefikError)
    await expect(applyTraefik(k, v => ({ ...addPort(v, 'zz', 19300), image: 'x' } as TraefikValues))).rejects.toBeInstanceOf(TraefikError)
    expect(k.calls.filter(a => a[0] !== 'get')).toHaveLength(0)
  })

  it.each(PROTECTED_NAMES)('never writes a config that drops protected %s', async (name) => {
    const k = cluster()
    await expect(applyTraefik(k, (v) => {
      return { ports: Object.fromEntries(Object.entries(v.ports).filter(([k]) => k !== `mc-${name}`)) }
    })).rejects.toBeInstanceOf(TraefikError)
    expect(k.calls.filter(a => a[0] !== 'get')).toHaveLength(0)
  })

  it('a conflict on write is a 409', async () => {
    const k = cluster({ conflict: true })
    await expect(applyTraefik(k, v => addPort(v, 'zz', 19300))).rejects.toMatchObject({ status: 409 })
  })

  it('serialises concurrent edits under the traefik lock', async () => {
    const k = cluster()
    await Promise.all([applyTraefik(k, v => addPort(v, 'a', 19300)), applyTraefik(k, v => addPort(v, 'b', 19301))])
    expect(k.calls.map(a => a[0])).toEqual(['get', 'apply', 'replace', 'get', 'apply', 'replace'])
  })
})
