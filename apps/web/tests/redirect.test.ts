// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../app/utils/redirect'

describe('safeRedirect', () => {
  it.each(['/servers?x=1', '/', '/a/b#c'])('allows %s', (p) => {
    expect(safeRedirect(p)).toBe(p)
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'servers',
    '',
    undefined,
    null,
    42,
    ['/a'],
  ])('rejects %j -> /', (p) => {
    expect(safeRedirect(p)).toBe('/')
  })
})
