import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UBadge, UCard } from '#components'
import IndexPage from '../app/pages/index.vue'

let status = 'healthy'
beforeEach(() => clearNuxtData())
registerEndpoint('/api/health', () => ({ status }))

describe('index page', () => {
  it('renders the heading and a UCard', async () => {
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.find('h1').text()).toBe('MC Server Manager')
    expect(wrapper.findComponent(UCard).exists()).toBe(true)
  })

  it.each([
    ['healthy', 'Back-end healthy'],
    ['unavailable', 'Back-end unavailable'],
    ['unauthorized', 'Back-end unauthorized'],
    ['misconfigured', 'Back-end misconfigured'],
  ])('shows distinct badge text for %s', async (s, text) => {
    status = s
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findComponent(UBadge).text()).toBe(text)
  })
})
