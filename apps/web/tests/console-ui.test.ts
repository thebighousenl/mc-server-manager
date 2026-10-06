import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import ConsolePanel from '../app/components/ConsolePanel.vue'
import PlayerList from '../app/components/PlayerList.vue'

let bodies: unknown[]
let notReady: boolean
registerEndpoint('/api/servers/zz/command', {
  method: 'POST',
  handler: async (event) => {
    const body = await (event as unknown as { web: { request: Request } }).web.request.json()
    bodies.push(body)
    if (notReady) throw createError({ statusCode: 422, data: { error: 'not_ready', message: 'server not ready' } })
    return { command: body.command, lines: ['[t INFO] Set the time to 0'], truncated: false }
  },
})
registerEndpoint('/api/servers/zz/players', () => ({ online: 2, max: 10, players: ['PlayerOne', 'Player Two'] }))
beforeEach(() => {
  bodies = []
  notReady = false
})

const send = async (wrapper: Awaited<ReturnType<typeof mountSuspended>>, command: string) => {
  await wrapper.find('input').setValue(command)
  await wrapper.find('form').trigger('submit')
}

describe('console panel', () => {
  it('shows the returned lines after submitting a command', async () => {
    const wrapper = await mountSuspended(ConsolePanel, { props: { name: 'zz' } })
    await send(wrapper, 'time set day')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Set the time to 0'))
    expect(bodies).toEqual([{ command: 'time set day' }])
  })

  it('shows "server not ready" for a 422', async () => {
    notReady = true
    const wrapper = await mountSuspended(ConsolePanel, { props: { name: 'zz' } })
    await send(wrapper, 'list')
    await vi.waitFor(() => expect(wrapper.text()).toContain('server not ready'))
  })

  it('rejects newlines client-side without calling the API', async () => {
    const wrapper = await mountSuspended(ConsolePanel, { props: { name: 'zz' } })
    await send(wrapper, 'say hi\nstop')
    await vi.waitFor(() => expect(wrapper.text()).toContain('single line'))
    expect(bodies).toEqual([])
  })

  it('explains that allowlist and op commands are runtime-only', async () => {
    const wrapper = await mountSuspended(ConsolePanel, { props: { name: 'zz' } })
    expect(wrapper.text()).toMatch(/allowlist.*op.*runtime-only.*Settings/s)
  })
})

describe('player list', () => {
  it('renders the online players', async () => {
    const wrapper = await mountSuspended(PlayerList, { props: { name: 'zz' } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('PlayerOne'))
    expect(wrapper.text()).toContain('Player Two')
    expect(wrapper.text()).toContain('2/10')
  })
})
