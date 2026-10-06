---

description: "Task list for Web Front-End Authentication"
---

# Tasks: Web Front-End Authentication

**Input**: Design documents from `/specs/002-web-frontend-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md

**Tests**: REQUIRED (constitution Principle II). Write the test, watch it fail, then implement. Vitest, `apps/web/tests/`.

**Organization**: Grouped by user story. Paths are relative to the repo root. No new dependencies (Principle I).

## Format: `[ID] [P?] [Story] Description. Files: ... Depends on: ...`

- **[P]**: Safe to run in parallel with other [P] tasks whose dependencies are met (no shared files).
- **Files**: the only files the task may create or edit. If a task needs another file, stop and raise it.
- **Depends on**: tasks that must be **merged** first.

## Agent Working Rules

1. One task = one issue = one branch/PR, named `002-<task-id>-<slug>` (e.g. `002-t014-authenticate`), branched from the latest `002-web-frontend-auth`.
2. Touch only the files listed in **Files**. Each file has exactly one owner task, except where a later task is explicitly listed as extending it.
3. Test tasks: commit the failing tests; the paired implementation task makes them pass. Run only your tests: `pnpm --filter web exec vitest run tests/<file>`, plus `pnpm --filter web lint` and `typecheck` before opening the PR.
4. Commit format: `type(web)[story-no]: description`, e.g. `feat(web)[1]: add authenticate service`.
5. Testing pattern (decision C1): all auth logic lives in pure functions in `apps/web/server/utils/` that take `(input, deps)` where `deps = { config: AuthConfig, now: () => number }`. Tests call these functions in a node environment (`// @vitest-environment node`) with `testConfig()` and a fake clock from `apps/web/tests/helpers/auth.ts`. Handlers and middleware are thin adapters that read `useRuntimeConfig()` via `getAuthConfig()`, call the pure function, and map the result to HTTP. Only the adapters read config or h3 request objects, and they are verified in T036.
6. Client IP (decision C2): handlers pass `getRequestIP(event, { xForwardedFor: config.trustProxy })` to the pure functions. Behind the cluster ingress `NUXT_AUTH_TRUST_PROXY=true` must be set, otherwise every operator shares the proxy IP.

---

## Phase 1: Setup

- [ ] T001 Add `auth` block to `runtimeConfig` in `apps/web/nuxt.config.ts`: `users: ''` (JSON string), `idleTimeoutMs: 1800000`, `maxLifetimeMs: 43200000`, `maxFailures: 5`, `lockoutMs: 300000`, `trustProxy: false` (server-only; env `NUXT_AUTH_USERS`, `NUXT_AUTH_IDLE_TIMEOUT_MS`, `NUXT_AUTH_MAX_LIFETIME_MS`, `NUXT_AUTH_MAX_FAILURES`, `NUXT_AUTH_LOCKOUT_MS`, `NUXT_AUTH_TRUST_PROXY`). Files: `apps/web/nuxt.config.ts`. Depends on: none
- [ ] T002 [P] Add `NUXT_AUTH_USERS='[]'` and `NUXT_AUTH_TRUST_PROXY=false` with explanatory comments to `.env.example`. Files: `.env.example`. Depends on: none
- [ ] T003 Create `apps/web/server/utils/auth-config.ts` (exports `AuthConfig` type and `getAuthConfig()`, the only reader of `useRuntimeConfig().auth`) and the test helper `apps/web/tests/helpers/auth.ts` (`testConfig(overrides?)`, `fakeClock(start)` with `advance(ms)`, `testUsers()` returning one operator with a precomputed hash). Files: `apps/web/server/utils/auth-config.ts`, `apps/web/tests/helpers/auth.ts`. Depends on: T001

---

## Phase 2: Foundational (blocks all stories)

- [ ] T004 [P] Write failing tests `apps/web/tests/password.test.ts`: `hashPassword` output matches `scrypt$<salt>$<hash>`; `verifyPassword` true for the right password, false for wrong or malformed hash, never throws; `parseUsers(json)` returns valid operators, ignores malformed hashes, returns `[]` for empty or invalid JSON, lower-cases usernames; `dummyVerify()` resolves false. Files: `apps/web/tests/password.test.ts`. Depends on: T003
- [ ] T005 [P] Write failing tests `apps/web/tests/sessions.test.ts` (fake clock): `createSession` returns a 32-byte base64url token; `getSession` returns `{ username }` and bumps `lastSeenAt`; returns `{ expired: true }` after `idleTimeoutMs` idle and at `maxLifetimeMs` even when active, and deletes the entry; unknown token returns `undefined`; `destroySession` removes it; two sessions for one username are independent; `cookieOptions(secure)` returns `HttpOnly`, `SameSite=Strict`, `Path=/` and `Secure` only when asked. Files: `apps/web/tests/sessions.test.ts`. Depends on: T003
- [ ] T006 [P] Write failing test `apps/web/tests/auth-log.test.ts`: `authLog(event, fields)` writes one JSON line (`level`, `ts`, `event`, `username`, `ip`) to stdout and drops any `password`, `passwordHash` or `token` field. Files: `apps/web/tests/auth-log.test.ts`. Depends on: none
- [ ] T007 [P] Implement `apps/web/server/utils/password.ts` (`hashPassword`, `verifyPassword`, `parseUsers`, `dummyVerify`; `node:crypto` scrypt + `timingSafeEqual`) to pass T004. Files: `apps/web/server/utils/password.ts`. Depends on: T004
- [ ] T008 [P] Implement `apps/web/server/utils/sessions.ts` (module-level `Map`; `createSession(username, deps)`, `getSession(token, deps)`, `destroySession(token)`, `SESSION_COOKIE = 'mc_session'`, `cookieOptions(secure)`) to pass T005. Files: `apps/web/server/utils/sessions.ts`. Depends on: T005, T003
- [ ] T009 [P] Implement `apps/web/server/utils/auth-log.ts` to pass T006. Files: `apps/web/server/utils/auth-log.ts`. Depends on: T006
- [ ] T010 [P] Create `apps/web/scripts/hash-password.mjs` that imports `hashPassword` from `../server/utils/password.ts` (Node 24 runs TypeScript directly; no duplicated hashing code) and prints the hash for `process.argv[2]`; add `"hash-password": "node scripts/hash-password.mjs"` to `apps/web/package.json`. Files: `apps/web/scripts/hash-password.mjs`, `apps/web/package.json`. Depends on: T007
- [ ] T011 Create startup plugin `apps/web/server/plugins/auth-config.ts` that logs an `error` auth-log event when `parseUsers(getAuthConfig().users)` is empty (fail-closed notice, FR-014). Files: `apps/web/server/plugins/auth-config.ts`. Depends on: T003, T007, T009

**Checkpoint**: `pnpm --filter web test` passes for T004-T006.

---

## Phase 3: User Story 1 - Sign in to reach the management UI (P1)

**Goal**: Visitors see only `/login`; valid credentials grant access.

**Independent Test**: Quickstart scenarios 1 and 2.

- [ ] T012 [P] [US1] Write failing tests `apps/web/tests/authenticate.test.ts` for `authenticate({ username, password, ip }, deps)` in `apps/web/server/utils/authenticate.ts`: valid credentials → `{ status: 200, username, token }`; wrong password and unknown user → identical `{ status: 401, message: 'Invalid credentials' }`; non-string, empty or >256-char fields → 400; logs `login_success` / `login_failure` without secrets; result never contains the hash or password. Files: `apps/web/tests/authenticate.test.ts`. Depends on: T003
- [ ] T013 [P] [US1] Write failing tests `apps/web/tests/redirect.test.ts` for `safeRedirect(target)`: allows `/servers?x=1`; rejects `https://evil.example`, `//evil.example`, `/\evil`, empty and non-string, falling back to `/`. Files: `apps/web/tests/redirect.test.ts`. Depends on: none
- [ ] T014 [US1] Implement `apps/web/server/utils/authenticate.ts` (uses `parseUsers`, `verifyPassword`, `dummyVerify`, `createSession`, `authLog`) to pass T012. Later extended by T032. Files: `apps/web/server/utils/authenticate.ts`. Depends on: T012, T007, T008, T009
- [ ] T015 [US1] Implement `apps/web/server/api/auth/login.post.ts` per `contracts/auth-api.md`: thin adapter that reads the body, computes the client IP (rule 6), calls `authenticate`, sets `SESSION_COOKIE` with `cookieOptions(!import.meta.dev)` on 200, maps `status` to HTTP via `createError`, and sets `Retry-After` when the result carries `retryAfter`. Files: `apps/web/server/api/auth/login.post.ts`. Depends on: T014
- [ ] T016 [P] [US1] Implement `apps/web/server/api/auth/me.get.ts`: reads `SESSION_COOKIE`, calls `getSession`, returns `{ username }` or 401. Files: `apps/web/server/api/auth/me.get.ts`. Depends on: T008
- [ ] T017 [P] [US1] Implement `safeRedirect` in `apps/web/app/utils/redirect.ts` to pass T013. Files: `apps/web/app/utils/redirect.ts`. Depends on: T013
- [ ] T018 [US1] Create `apps/web/app/pages/login.vue` (Nuxt UI `UForm`, username + password, generic error alert, a distinct "Too many attempts, try again later" message on 429, on success `navigateTo(safeRedirect(route.query.redirect))`). Files: `apps/web/app/pages/login.vue`. Depends on: T015, T017
- [ ] T019 [US1] Create `apps/web/app/middleware/auth.global.ts`: skip `/login`; call `/api/auth/me` (forward the cookie with `useRequestHeaders(['cookie'])` on SSR); on 401 `navigateTo('/login?redirect=' + encodeURIComponent(to.fullPath))`. Files: `apps/web/app/middleware/auth.global.ts`. Depends on: T016, T017
- [ ] T020 [US1] Confirm `apps/web/tests/index.test.ts` still passes with the global middleware; if `mountSuspended` is redirected, register `/api/auth/me` with `registerEndpoint` in that test. Files: `apps/web/tests/index.test.ts`. Depends on: T019

**Checkpoint**: Sign-in works in the browser.

---

## Phase 4: User Story 2 - Block unauthenticated access to all management actions (P1)

**Goal**: Every `/api/**` route refuses requests without a valid session.

**Independent Test**: Quickstart scenario 1 (curl).

- [ ] T021 [P] [US2] Write failing tests `apps/web/tests/authorize.test.ts` for `isPublic(path)` and `authorize({ path, method, token, origin, host }, deps)` in `apps/web/server/utils/authorize.ts`: public = `POST /api/auth/login`, `GET /api/health` and non-`/api` paths; all other `/api/**` → 401 without cookie or with unknown token; expired session → 401 and logs `session_expired`; valid session → `{ ok: true, username }` and idle timer bumped; no configured users → 401 (fail closed); non-GET/HEAD with mismatched `origin` → 403, matching origin passes. Files: `apps/web/tests/authorize.test.ts`. Depends on: T003
- [ ] T022 [US2] Implement `apps/web/server/utils/authorize.ts` to pass T021. Files: `apps/web/server/utils/authorize.ts`. Depends on: T021, T007, T008, T009
- [ ] T023 [US2] Implement `apps/web/server/middleware/auth.ts` as a thin adapter over `authorize` (reads cookie, `Origin`, host; throws 401/403 via `createError`; sets `event.context.auth`). Then run `apps/web/tests/health.test.ts` to confirm `/api/health` is unchanged. Files: `apps/web/server/middleware/auth.ts`. Depends on: T022

**Checkpoint**: curl against every route confirms SC-001. **MVP = Phases 1-4.**

---

## Phase 5: User Story 3 - Sign out and session expiry (P2)

**Goal**: Operators can sign out; stale sessions send them back to sign-in.

**Independent Test**: Quickstart scenarios 3, 4, 7.

- [ ] T024 [P] [US3] Write failing tests `apps/web/tests/logout.test.ts` for `logout(token, deps)` in `apps/web/server/utils/logout.ts`: destroys the session so `getSession` returns `undefined`; idempotent for unknown tokens; logs `logout` with the username; logging out one of two concurrent sessions of the same operator leaves the other valid. Files: `apps/web/tests/logout.test.ts`. Depends on: T003
- [ ] T025 [US3] Implement `apps/web/server/utils/logout.ts` to pass T024. Files: `apps/web/server/utils/logout.ts`. Depends on: T024, T008, T009
- [ ] T026 [US3] Implement `apps/web/server/api/auth/logout.post.ts` (calls `logout`, clears the cookie, always 204). Files: `apps/web/server/api/auth/logout.post.ts`. Depends on: T025
- [ ] T027 [P] [US3] Add a "Sign out" `UButton` to `apps/web/app/pages/index.vue` that POSTs `/api/auth/logout` then `navigateTo('/login')`. Files: `apps/web/app/pages/index.vue`. Depends on: T026, T019
- [ ] T028 [P] [US3] Create client plugin `apps/web/app/plugins/auth-expired.ts` that redirects to `/login?redirect=...` when any `$fetch`/`useFetch` call returns 401 mid-session. Files: `apps/web/app/plugins/auth-expired.ts`. Depends on: T019

**Checkpoint**: Back button after sign-out shows login; stale cookie is rejected.

---

## Phase 6: User Story 4 - Resist credential guessing (P2)

**Goal**: Repeated failures lock out the username and the client IP for a cooldown.

**Independent Test**: Quickstart scenario 5.

- [ ] T029 [P] [US4] Write failing tests `apps/web/tests/throttle.test.ts` (fake clock) for `apps/web/server/utils/throttle.ts`: with `maxFailures` 5 the 5th failure locks the key; `isLocked` is true until `lockoutMs` passes; failures are counted within a rolling `lockoutMs` window; `recordSuccess` clears the username key; `user:<name>` and `ip:<addr>` keys are independent. Files: `apps/web/tests/throttle.test.ts`. Depends on: T003
- [ ] T030 [P] [US4] Write failing tests `apps/web/tests/authenticate-throttle.test.ts` for `authenticate`: the 6th attempt after 5 failures, even with the correct password, → `{ status: 429, retryAfter }` and logs `login_locked`; correct sign-in works after `lockoutMs`; two different IPs are tracked separately; one IP locks only itself, not other IPs. Files: `apps/web/tests/authenticate-throttle.test.ts`. Depends on: T014
- [ ] T031 [US4] Implement `apps/web/server/utils/throttle.ts` (`recordFailure`, `recordSuccess`, `isLocked`, `retryAfterSeconds`) to pass T029. Files: `apps/web/server/utils/throttle.ts`. Depends on: T029
- [ ] T032 [US4] Extend `apps/web/server/utils/authenticate.ts`: check lock before verifying the password; record failure/success; return 429 with `retryAfter`; log `login_locked`, to pass T030. Files: `apps/web/server/utils/authenticate.ts`. Depends on: T030, T031, T014

**Checkpoint**: Brute force is blocked (SC-003).

---

## Phase 7: Polish & Cross-Cutting

- [ ] T033 [P] Write `apps/web/tests/auth-redaction.test.ts`: run a full failed sign-in, successful sign-in, and sign-out through `authenticate` and `logout` with stdout captured; output contains no password, hash or token (SC-005). Files: `apps/web/tests/auth-redaction.test.ts`. Depends on: T014, T025
- [ ] T034 [P] Update `README.md`: sign-in required, creating an operator with `pnpm --filter web hash-password`, new env variables (including `NUXT_AUTH_TRUST_PROXY=true` behind the ingress), single-replica note, `NUXT_AUTH_USERS` as a cluster Secret. Files: `README.md`. Depends on: T011
- [ ] T035 Run `pnpm lint && pnpm typecheck && pnpm test` from the repo root and fix findings in the files you own only; report any other file as a new issue. Files: none unless fixing. Depends on: T023, T028, T032, T033
- [ ] T036 Walk through every scenario in `quickstart.md` against `pnpm dev`, plus: cookie flags (`HttpOnly`, `SameSite=Strict`, `Secure` in a production build), `X-Forwarded-For` lockout separation with `NUXT_AUTH_TRUST_PROXY=true`, and the time-to-dashboard check (SC-002). Record results in `specs/002-web-frontend-auth/verification.md`. Files: `specs/002-web-frontend-auth/verification.md`. Depends on: T035, T034

---

## Dependencies & Execution Waves

Agents can pick up any task whose **Depends on** are all merged. Suggested waves (tasks in a wave are mutually parallel):

| Wave | Tasks | Gate before next wave |
|---|---|---|
| 0 | T001, T002 | merged |
| 1 | T003, T006, T013 | merged |
| 2 | T004, T005, T009, T012, T017, T021, T024, T029 (tests plus T009, T017) | tests committed |
| 3 | T007, T008, T031 | tests green |
| 4 | T010, T011, T014, T016, T022, T025 | |
| 5 | T015, T019, T023, T026, T030, T033 | |
| 6 | T018, T020, T027, T028, T032, T034 | US1+US2 MVP verified (T001-T023) |
| 7 | T035, then T036 | |

Single-owner exceptions (sequential by design): `authenticate.ts` is created by T014 and extended by T032. Everything else has one owner.

## Implementation Strategy

- **MVP = T001-T023**: the app is safe to expose. Verify quickstart scenarios 1, 2, 6, 8 before continuing.
- Then US3, US4, polish.
- Converting to GitHub issues: use each task line verbatim as the issue body (it already carries Files and Depends on) plus the "Agent Working Rules" section as a linked reference.
