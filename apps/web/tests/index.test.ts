import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UCard } from '#components'
import IndexPage from '../app/pages/index.vue'

describe('index page', () => {
  it('renders the heading and a UCard', async () => {
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.find('h1').text()).toBe('MC Server Manager')
    expect(wrapper.findComponent(UCard).exists()).toBe(true)
  })
})
