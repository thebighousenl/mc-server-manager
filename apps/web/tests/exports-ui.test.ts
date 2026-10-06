import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ExportsPage from '../app/pages/exports.vue'

const file = 'zz-world-20260102T030405Z.tgz'
registerEndpoint('/api/exports', () => ({ exports: [{ file, server: 'zz', sizeBytes: 1048576, createdAt: '2026-01-02T03:04:05Z' }] }))

describe('exports page', () => {
  it('lists exports and links downloads to /api/exports/<file>', async () => {
    const wrapper = await mountSuspended(ExportsPage)
    await vi.waitFor(() => expect(wrapper.text()).toContain(file))
    expect(wrapper.text()).toContain('zz')
    expect(wrapper.text()).toContain('1.0 MB')
    expect(wrapper.find(`a[href="/api/exports/${file}"]`).exists()).toBe(true)
  })
})
