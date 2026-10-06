import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import SettingsForm from '../app/components/SettingsForm.vue'

const detail = {
  name: 'zz', resourceVersion: '7',
  settings: [
    { key: 'EULA', value: 'TRUE', editable: false },
    { key: 'VERSION', value: 'LATEST', editable: true },
    { key: 'MAX_PLAYERS', value: '10', editable: true },
    { key: 'GAMEMODE', value: 'survival', editable: true },
  ],
}
let bodies: unknown[]
let status: number
registerEndpoint('/api/servers/zz', () => detail)
registerEndpoint('/api/servers/zz/settings', {
  method: 'PUT',
  handler: async (event) => {
    bodies.push(await (event as unknown as { web: { request: Request } }).web.request.json())
    return status === 409 ? Response.json({ error: 'stale', message: 'reload' }, { status }) : { server: 'zz', warnings: ['pulled on start'] }
  },
})
beforeEach(() => {
  bodies = []
  status = 200
})

const mount = async () => {
  const wrapper = await mountSuspended(SettingsForm, { props: { name: 'zz' } })
  await vi.waitFor(() => expect(wrapper.find('input[data-testid="setting-MAX_PLAYERS"]').exists()).toBe(true))
  return wrapper
}
const edit = (w: Awaited<ReturnType<typeof mount>>, key: string, value: string) => w.find(`input[data-testid="setting-${key}"]`).setValue(value)

describe('settings form', () => {
  it('renders inputs only for editable keys and the rest read-only', async () => {
    const wrapper = await mount()
    expect(wrapper.find('input[data-testid="setting-GAMEMODE"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="setting-EULA"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('EULA')
    expect(wrapper.text()).toContain('TRUE')
  })

  it('validates with the enum and range rules and does not open the dialog', async () => {
    const wrapper = await mount()
    await edit(wrapper, 'MAX_PLAYERS', '0')
    await edit(wrapper, 'GAMEMODE', 'hardcore')
    await wrapper.find('[data-testid="save"]').trigger('click')
    expect(wrapper.text()).toContain('MAX_PLAYERS must be')
    expect(wrapper.text()).toContain('GAMEMODE must be')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(bodies).toEqual([])
  })

  it('confirms a restart with warnings, then sends only the changed keys with the resourceVersion', async () => {
    const wrapper = await mount()
    await edit(wrapper, 'MAX_PLAYERS', '20')
    await wrapper.find('[data-testid="save"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').text()).toContain('restart')
    expect(wrapper.find('[role="dialog"]').text()).toContain('LATEST')
    expect(bodies).toEqual([])
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(bodies).toEqual([{ settings: { MAX_PLAYERS: '20' }, resourceVersion: '7', confirm: true }]))
    await vi.waitFor(() => expect(wrapper.text()).toContain('pulled on start'))
  })

  it('shows "changed elsewhere, reload" on a 409', async () => {
    status = 409
    const wrapper = await mount()
    await edit(wrapper, 'MAX_PLAYERS', '20')
    await wrapper.find('[data-testid="save"]').trigger('click')
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('changed elsewhere'))
  })

  it('does nothing when nothing changed', async () => {
    const wrapper = await mount()
    await wrapper.find('[data-testid="save"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
