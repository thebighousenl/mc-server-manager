// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadNuxtConfig } from 'nuxt/kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forward } from '../server/utils/servers-gateway'
import { hashPassword, parseUsers, verifyPassword } from '../server/utils/password'

// Regression for #69: the documented flow (hash -> root .env -> `pnpm dev`) must authenticate.
const dev = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.dev as string
const dotenvFlag = dev.match(/--dotenv\s+(\S+)/)?.[1] // what `nuxt dev` is told to load, relative to apps/web

describe('NUXT_AUTH_USERS from the repo-root .env', () => {
  let root = ''
  const saved = process.env.NUXT_AUTH_USERS // dotenv never overwrites an existing var, so start clean and restore
  beforeEach(() => {
    delete process.env.NUXT_AUTH_USERS
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.NUXT_AUTH_USERS
    else process.env.NUXT_AUTH_USERS = saved
    rmSync(root, { recursive: true, force: true })
  })

  it('reaches the app intact and verifies', async () => {
    root = mkdtempSync(join(tmpdir(), 'env-'))
    const web = join(root, 'apps', 'web') // mirrors the real layout: nuxt's cwd is apps/web, .env lives at the root
    mkdirSync(web, { recursive: true })
    const hash = await hashPassword('dev')
    writeFileSync(join(root, '.env'), `NUXT_AUTH_USERS='[{"username":"dev","passwordHash":"${hash}"}]'\n`)

    // Same dotenv wiring as the nuxt CLI: loadNuxtConfig({ cwd, dotenv: { cwd, fileName: --dotenv } }).
    await loadNuxtConfig({ cwd: web, dotenv: { cwd: web, fileName: dotenvFlag } })

    const users = parseUsers(process.env.NUXT_AUTH_USERS ?? '')
    expect(users).toHaveLength(1)
    expect(await verifyPassword('dev', users[0]!.passwordHash)).toBe(true)
  })
})

// A missing NUXT_MANAGER_URL / NUXT_MANAGER_SECRET must surface as a clean 502, not a crash.
describe('gateway without manager config', () => {
  it.each([['', 's'], ['http://m', ''], ['', '']])('url=%j secret=%j -> 502 misconfigured, no fetch', async (managerUrl, managerSecret) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const res = await forward({ method: 'GET', path: '/api/servers', username: 'alice' }, { managerUrl, managerSecret, fetch })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'misconfigured' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
