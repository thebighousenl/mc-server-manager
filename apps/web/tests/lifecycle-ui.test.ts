import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import LifecycleControls from '../app/components/LifecycleControls.vue'
import LogPanel from '../app/components/LogPanel.vue'

let calls: { action: string, body: unknown }[]
for (const action of ['start', 'stop', 'restart']) {
  registerEndpoint(`/api/servers/zz/${action}`, {
    method: 'POST',
    handler: async (event) => {
      const text = await (event as unknown as { web: { request: Request } }).web.request.text()
      calls.push({ action, body: text ? JSON.parse(text) : undefined })
      return { server: 'zz', warnings: action === 'stop' ? [] : ['VERSION is LATEST: may upgrade the world'] }
    },
  })
}
beforeEach(() => { calls = [] })
const controls = (state: string) => mountSuspended(LifecycleControls, { props: { name: 'zz', state } })

describe('lifecycle controls', () => {
  it.each(['stop', 'restart'])('%s opens a confirmation and only calls the API after confirming', async (action) => {
    const wrapper = await controls('running')
    await wrapper.find(`[data-testid="${action}"]`).trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(calls).toEqual([])
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(calls).toEqual([{ action, body: { confirm: true } }]))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('cancelling the confirmation makes no call', async () => {
    const wrapper = await controls('running')
    await wrapper.find('[data-testid="stop"]').trigger('click')
    await wrapper.find('[data-testid="cancel"]').trigger('click')
    expect(calls).toEqual([])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('start calls the API directly and shows the warnings from the response', async () => {
    const wrapper = await controls('stopped')
    await wrapper.find('[data-testid="start"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('VERSION is LATEST: may upgrade the world'))
    expect(calls).toEqual([{ action: 'start', body: undefined }])
  })

  it.each(['starting', 'stopping'])('disables every button while %s', async (state) => {
    const wrapper = await controls(state)
    for (const id of ['start', 'stop', 'restart']) expect(wrapper.find(`[data-testid="${id}"]`).attributes('disabled')).toBeDefined()
  })

  it('only offers start for a stopped server and stop/restart for a running one', async () => {
    const stopped = await controls('stopped')
    expect(stopped.find('[data-testid="start"]').attributes('disabled')).toBeUndefined()
    expect(stopped.find('[data-testid="stop"]').attributes('disabled')).toBeDefined()
    const running = await controls('running')
    expect(running.find('[data-testid="start"]').attributes('disabled')).toBeDefined()
    expect(running.find('[data-testid="restart"]').attributes('disabled')).toBeUndefined()
  })
})

class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners: Record<string, ((e: { data: string }) => void)[]> = {}
  closed = false
  constructor(public url: string) { FakeEventSource.instances.push(this) }
  addEventListener(type: string, fn: (e: { data: string }) => void) { (this.listeners[type] ??= []).push(fn) }
  close() { this.closed = true }
}
describe('log panel', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders streamed lines and closes the EventSource on unmount', async () => {
    const wrapper = await mountSuspended(LogPanel, { props: { name: 'zz' } })
    const es = FakeEventSource.instances[0]!
    expect(es.url).toBe('/api/servers/zz/logs?follow=1&tail=200')
    es.listeners.message!.forEach(fn => fn({ data: 'Server started.' }))
    es.listeners.message!.forEach(fn => fn({ data: 'Player connected' }))
    await flushPromises()
    expect(wrapper.text()).toContain('Server started.')
    expect(wrapper.text()).toContain('Player connected')
    wrapper.unmount()
    expect(es.closed).toBe(true)
  })
})
