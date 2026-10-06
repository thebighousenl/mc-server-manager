import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ServerCard from '../app/components/ServerCard.vue'

const server = (over = {}) => ({
  name: 'zz', worldName: 'zz', gameMode: 'survival', port: 19140, state: 'running', desired: 'running',
  protected: false, managed: false, ageSeconds: 60, ...over,
})
const plan = { server: 'zz', changes: [{ kind: 'Deployment', name: 'bedrock-zz', add: { 'mc-manager/managed': 'true' } }] }
let bodies: unknown[]
registerEndpoint('/api/servers/zz/adopt', {
  method: 'POST',
  handler: async (event) => {
    const body = await (event as unknown as { web: { request: Request } }).web.request.json()
    bodies.push(body)
    return body.confirm ? { ...plan, changed: true } : plan
  },
})
beforeEach(() => { bodies = [] })

describe('adopt UI', () => {
  it('shows the plan first, and only adopts after confirming', async () => {
    const wrapper = await mountSuspended(ServerCard, { props: { server: server() } })
    await wrapper.find('[data-testid="adopt"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('mc-manager/managed=true'))
    expect(bodies).toEqual([{ confirm: false }])
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    expect(bodies).toEqual([{ confirm: false }, { confirm: true }])
  })

  it('cancel makes no adopt call', async () => {
    const wrapper = await mountSuspended(ServerCard, { props: { server: server() } })
    await wrapper.find('[data-testid="adopt"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="cancel"]').exists()).toBe(true))
    await wrapper.find('[data-testid="cancel"]').trigger('click')
    expect(bodies).toEqual([{ confirm: false }])
  })

  it('shows no adopt action for managed servers', async () => {
    const wrapper = await mountSuspended(ServerCard, { props: { server: server({ managed: true }) } })
    expect(wrapper.find('[data-testid="adopt"]').exists()).toBe(false)
  })

  it('protected servers show a lock badge and no delete control', async () => {
    const wrapper = await mountSuspended(ServerCard, { props: { server: server({ protected: true, managed: true }) } })
    expect(wrapper.find('[data-testid="protected-badge"]').exists()).toBe(true)
    expect(wrapper.text().toLowerCase()).not.toContain('delete')
    expect(wrapper.find('[data-testid="delete"]').exists()).toBe(false)
  })
})
