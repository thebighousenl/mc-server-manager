import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import CreateServerForm from '../app/components/CreateServerForm.vue'

let bodies: unknown[]
let fail: boolean
let reachable: boolean
registerEndpoint('/api/servers', {
  method: 'POST',
  handler: async (event) => {
    bodies.push(await (event as unknown as { web: { request: Request } }).web.request.json())
    return fail ? Response.json({ error: 'conflict', message: 'port 19134 is already in use' }, { status: 409 }) : { server: 'zz', firewall: { port: 19133, protocol: 'udp' } }
  },
})
registerEndpoint('/api/servers/zz/reachability', { method: 'POST', handler: () => ({ reachable }) })
beforeEach(() => {
  bodies = []
  fail = false
  reachable = true
})

const mount = () => mountSuspended(CreateServerForm)
const set = (w: Awaited<ReturnType<typeof mount>>, id: string, value: string) => w.find(`input[data-testid="${id}"]`).setValue(value)
const submit = (w: Awaited<ReturnType<typeof mount>>) => w.find('[data-testid="submit"]').trigger('click')

describe('create server form', () => {
  it('validates name, port and settings with the same rules and does not open the dialog', async () => {
    const wrapper = await mount()
    await set(wrapper, 'name', 'Bad Name')
    await set(wrapper, 'port', '80')
    await set(wrapper, 'setting-MAX_PLAYERS', '0')
    await submit(wrapper)
    expect(wrapper.text()).toContain('name must be')
    expect(wrapper.text()).toContain('port must be')
    expect(wrapper.text()).toContain('MAX_PLAYERS must be')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(bodies).toEqual([])
  })

  it('confirms the Traefik restart for all HTTP ingress, then sends the body', async () => {
    const wrapper = await mount()
    await set(wrapper, 'name', 'zz')
    await set(wrapper, 'setting-MAX_PLAYERS', '8')
    await submit(wrapper)
    const dialog = wrapper.find('[role="dialog"]').text()
    expect(dialog).toContain('Traefik')
    expect(dialog).toContain('all HTTP ingress')
    expect(bodies).toEqual([])
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(bodies).toEqual([{ name: 'zz', settings: { MAX_PLAYERS: '8' }, confirm: true }]))
  })

  it('sends a given port, then shows the firewall reminder and the outside check', async () => {
    const wrapper = await mount()
    await set(wrapper, 'name', 'zz')
    await set(wrapper, 'port', '19133')
    await submit(wrapper)
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('open UDP 19133 in the node and provider firewall'))
    expect(bodies).toEqual([{ name: 'zz', port: 19133, settings: {}, confirm: true }])
    await wrapper.find('[data-testid="check-outside"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Reachable from outside'))
  })

  it('says so when the outside check fails', async () => {
    reachable = false
    const wrapper = await mount()
    await set(wrapper, 'name', 'zz')
    await submit(wrapper)
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="check-outside"]').exists()).toBe(true))
    await wrapper.find('[data-testid="check-outside"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Not reachable'))
  })

  it('shows server errors inline and keeps the form', async () => {
    fail = true
    const wrapper = await mount()
    await set(wrapper, 'name', 'zz')
    await submit(wrapper)
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('port 19134 is already in use'))
    expect(wrapper.find('input[data-testid="name"]').exists()).toBe(true)
  })
})
