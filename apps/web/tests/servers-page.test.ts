import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ConfirmDialog from '../app/components/ConfirmDialog.vue'
import ServersPage from '../app/pages/servers/index.vue'

const server = (name: string, over = {}) => ({
  name, worldName: `${name} world`, gameMode: 'survival', port: 19132, state: 'running', desired: 'running',
  protected: true, managed: true, ageSeconds: 86400, ...over,
})
const NAMES = ['daan', 'creative', 'kontgat', 'plaskutje', 'gaitie']
let list: { servers: object[], clusterOk: boolean, error?: string }
registerEndpoint('/api/servers', () => list)

class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners: Record<string, ((e: { data?: string }) => void)[]> = {}
  onerror: ((e: { data?: string }) => void) | null = null
  closed = false
  constructor(public url: string) { FakeEventSource.instances.push(this) }
  addEventListener(type: string, fn: (e: { data?: string }) => void) { (this.listeners[type] ??= []).push(fn) }
  close() { this.closed = true }
  emit(type: string, data: object) { this.listeners[type]?.forEach(fn => fn({ data: JSON.stringify(data) })) }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  list = { servers: NAMES.map((n, i) => server(n, { port: 19132 + i })), clusterOk: true }
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const mount = async () => {
  const wrapper = await mountSuspended(ServersPage)
  await flushPromises()
  return wrapper
}

describe('servers page', () => {
  it('renders five cards with name, world, mode, port, state and age', async () => {
    const wrapper = await mount()
    const cards = wrapper.findAll('[data-testid="server-card"]')
    expect(cards).toHaveLength(5)
    const text = cards[0]!.text()
    for (const part of ['daan', 'daan world', 'survival', '19132', 'running', '1d']) expect(text).toContain(part)
  })

  it('makes a failing server visibly distinct', async () => {
    list.servers = [server('daan', { state: 'failing' }), server('creative')]
    const wrapper = await mount()
    const [bad, good] = wrapper.findAll('[data-testid="state-badge"]')
    expect(bad!.text()).toBe('failing')
    expect(bad!.classes().join(' ')).not.toBe(good!.classes().join(' '))
  })

  it('shows the error banner and no empty list when the cluster is unreachable', async () => {
    list = { servers: [], clusterOk: false, error: 'cluster unreachable' }
    const wrapper = await mount()
    expect(wrapper.text()).toContain('cluster unreachable')
    expect(wrapper.find('[data-testid="no-servers"]').exists()).toBe(false)
  })

  it('updates a card from a servers event', async () => {
    const wrapper = await mount()
    FakeEventSource.instances[0]!.emit('servers', { servers: [server('daan', { state: 'stopped' })], clusterOk: true })
    await flushPromises()
    const cards = wrapper.findAll('[data-testid="server-card"]')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.text()).toContain('stopped')
  })

  it('reconnects after an SSE error', async () => {
    const wrapper = await mount()
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const first = FakeEventSource.instances[0]!
    first.onerror?.({})
    expect(first.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(FakeEventSource.instances).toHaveLength(2)
    wrapper.unmount()
    expect(FakeEventSource.instances[1]!.closed).toBe(true)
  })
})

describe('ConfirmDialog', () => {
  const props = { title: 'Stop server', body: 'Players will be disconnected.' }

  it('emits confirm and cancel', async () => {
    const wrapper = await mountSuspended(ConfirmDialog, { props })
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await wrapper.find('[data-testid="cancel"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('keeps confirm disabled until the typed text equals requireText', async () => {
    const wrapper = await mountSuspended(ConfirmDialog, { props: { ...props, requireText: 'daan' } })
    const button = () => wrapper.find('[data-testid="confirm"]')
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('input').setValue('daa')
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('input').setValue('daan')
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('shows warnings', async () => {
    const wrapper = await mountSuspended(ConfirmDialog, { props: { ...props, warnings: ['may upgrade the world'] } })
    expect(wrapper.text()).toContain('may upgrade the world')
  })
})
