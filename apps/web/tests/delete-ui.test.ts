import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import DeleteServerDialog from '../app/components/DeleteServerDialog.vue'

let bodies: unknown[]
let fail: boolean
registerEndpoint('/api/servers/zz', {
  method: 'DELETE',
  handler: async (event) => {
    bodies.push(await (event as unknown as { web: { request: Request } }).web.request.json())
    return fail ? Response.json({ error: 'conflict', message: 'exporting zz failed' }, { status: 409 }) : { server: 'zz', exported: 'zz-zz-20260102T030405Z.tgz' }
  },
})
beforeEach(() => {
  bodies = []
  fail = false
})

const mount = (props = {}) => mountSuspended(DeleteServerDialog, { props: { name: 'zz', protected: false, ...props } })
const open = async (w: Awaited<ReturnType<typeof mount>>) => w.find('[data-testid="delete"]').trigger('click')

describe('delete server dialog', () => {
  it('renders no delete control for a protected server', async () => {
    const wrapper = await mount({ protected: true })
    expect(wrapper.find('[data-testid="delete"]').exists()).toBe(false)
    expect(wrapper.text().toLowerCase()).not.toContain('delete')
  })

  it('warns the world is deleted and exported first, with no opt-out control', async () => {
    const wrapper = await mount()
    await open(wrapper)
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.text()).toContain('world')
    expect(dialog.text()).toContain('exported first')
    expect(dialog.find('input[type="checkbox"]').exists()).toBe(false)
    expect(dialog.findAll('input')).toHaveLength(1) // only the typed-name field
  })

  it('keeps the confirm button disabled until the exact name is typed', async () => {
    const wrapper = await mount()
    await open(wrapper)
    const confirm = () => wrapper.find('[data-testid="confirm"]')
    expect(confirm().attributes('disabled')).toBeDefined()
    await wrapper.find('[role="dialog"] input').setValue('ZZ')
    expect(confirm().attributes('disabled')).toBeDefined()
    await wrapper.find('[role="dialog"] input').setValue('zz')
    expect(confirm().attributes('disabled')).toBeUndefined()
    expect(bodies).toEqual([])
  })

  it('sends only confirmName', async () => {
    const wrapper = await mount()
    await open(wrapper)
    await wrapper.find('[role="dialog"] input').setValue('zz')
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(bodies).toEqual([{ confirmName: 'zz' }]))
  })

  it('shows a failed export and keeps the server', async () => {
    fail = true
    const wrapper = await mount()
    await open(wrapper)
    await wrapper.find('[role="dialog"] input').setValue('zz')
    await wrapper.find('[data-testid="confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('exporting zz failed'))
    expect(wrapper.find('[data-testid="delete"]').exists()).toBe(true)
  })
})
