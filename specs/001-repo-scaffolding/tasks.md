# Tasks: Repository Base Scaffolding

**Input**: Design documents from `/specs/001-repo-scaffolding/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. Constitution Principle II (Test-First) is non-negotiable: write each test, see
it fail, then implement.

**Format**: `- [ ] [ID] [P?] [Story?] Description with file path` (`[P]` = parallelizable)

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create root `package.json` (private, `engines.node >=24`, `packageManager` pnpm, scripts: `dev` runs both apps, `lint`, `typecheck`, `test` each via `pnpm -r`) and `pnpm-workspace.yaml` listing `apps/*`
- [ ] T002 [P] Create `.nvmrc` containing `24` and `.npmrc` containing `engine-strict=true` so install fails with a message naming the required Node version
- [ ] T003 [P] Create `.gitignore` ignoring `node_modules`, `.env`, `.nuxt`, `.output`, `dist`, `coverage`
- [ ] T004 [P] Create `.env.example` with `MANAGER_SECRET`, `MANAGER_HOST=127.0.0.1`, `MANAGER_PORT=3001`, `NUXT_MANAGER_URL=http://127.0.0.1:3001`, `NUXT_MANAGER_SECRET` (placeholders only, comment: secrets must match and be >= 32 chars)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Both app skeletons install, lint, and type-check before any story work.

- [ ] T005 [P] Create `apps/manager/package.json` (name `manager`, type module; deps `fastify`; devDeps `typescript`, `tsx`, `vitest`, `eslint`, `typescript-eslint`, `@types/node`; scripts `dev` (`tsx watch src/index.ts`), `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`)), `apps/manager/tsconfig.json` (strict, NodeNext), `apps/manager/eslint.config.js`, `apps/manager/vitest.config.ts`, and a minimal `apps/manager/src/index.ts` (empty export) so lint and type-check have a source file
- [ ] T006 [P] Scaffold `apps/web` as a Nuxt 4 app: `apps/web/package.json` (deps `nuxt` 4.x, `@nuxt/ui` 4.x latest stable pinned exactly, `tailwindcss`; devDeps `vitest`, `@nuxt/test-utils`, `@nuxt/eslint`, `eslint`, `typescript`, `vue-tsc`; scripts `dev`, `build`, `lint`, `typecheck` (`nuxt typecheck`), `test` (`vitest run`)), `apps/web/nuxt.config.ts` (modules `@nuxt/ui`, `@nuxt/eslint`), `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts` (using `defineVitestConfig` from `@nuxt/test-utils/config`, environment `nuxt`), and a minimal `apps/web/app/app.vue` (`<NuxtPage />`)
- [ ] T007 Run `pnpm install` at repo root to generate `pnpm-lock.yaml`; confirm `pnpm lint` and `pnpm typecheck` run without error on the empty skeletons

**Checkpoint**: Workspace installs and both projects lint/type-check.

---

## Phase 3: User Story 1 - Run the front-end locally (Priority: P1) 🎯 MVP

**Goal**: Nuxt 4 app serves a styled starter page using Nuxt UI.

**Independent Test**: `pnpm --filter web dev`, open http://localhost:3000, starter page renders styled UI components with no console errors (quickstart scenario 1).

### Tests for User Story 1

- [ ] T008 [US1] Write failing test `apps/web/tests/index.test.ts` that mounts/renders the index page and asserts the starter heading and a Nuxt UI component (e.g. `UCard`) render

### Implementation for User Story 1

- [ ] T009 [US1] Create `apps/web/app/app.vue` wrapping `<NuxtPage />` in `<UApp>`
- [ ] T010 [P] [US1] Create `apps/web/app/assets/css/main.css` importing `tailwindcss` and `@nuxt/ui`, and register it in `apps/web/nuxt.config.ts`
- [ ] T011 [US1] Create `apps/web/app/pages/index.vue` starter page: page title "MC Server Manager" and a `UCard` placeholder (back-end status slot added in US3); make T008 pass

**Checkpoint**: US1 independently demonstrable.

---

## Phase 4: User Story 2 - Run the back-end as a separate process (Priority: P1)

**Goal**: Fastify manager runs standalone; every request, health included, needs the shared secret.

**Independent Test**: Start only the manager; `curl` with the secret returns 200 `{status:"ok"}`, without it returns 401 (quickstart scenario 2). Contract: `contracts/manager-api.yaml`.

### Tests for User Story 2

- [ ] T012 [P] [US2] Write failing test `apps/manager/tests/health.test.ts` using `buildApp().inject()`: (a) valid Bearer secret → 200 with `status:"ok"` and numeric `uptimeSeconds`; (b) no header → 401 `{error:"unauthorized"}`; (c) wrong secret → 401; (d) same-length wrong secret → 401
- [ ] T013 [P] [US2] Write failing test `apps/manager/tests/config.test.ts`: config loader throws when `MANAGER_SECRET` is unset or shorter than 32 chars, and applies defaults host `127.0.0.1` / port `3001`

### Implementation for User Story 2

- [ ] T014 [US2] Implement `apps/manager/src/config.ts` (`loadConfig(env)` validating `MANAGER_SECRET` >= 32 chars, host, port); make T013 pass
- [ ] T015 [US2] Implement `apps/manager/src/app.ts` exporting `buildApp(config)`: Fastify with pino logging (redact `req.headers.authorization`), `onRequest` hook comparing Bearer token to secret with `crypto.timingSafeEqual` (length-checked), replying 401 `{error:"unauthorized"}` otherwise
- [ ] T016 [US2] Implement `apps/manager/src/routes/health.ts` (`GET /health` → `{status:"ok", uptimeSeconds: process.uptime()}`) and register it in `apps/manager/src/app.ts`; make T012 pass
- [ ] T017 [US2] Implement `apps/manager/src/index.ts`: load config from `process.env`, build app, listen on host/port, log startup, exit non-zero on config error; on a listen error (e.g. `EADDRINUSE`) log the host and port that conflicted before exiting

**Checkpoint**: US2 independently demonstrable; US1 and US2 can run in parallel with no coupling.

---

## Phase 5: User Story 3 - Front-end reaches back-end only via its server layer (Priority: P2)

**Goal**: Starter page shows back-end health relayed through Nitro; browser never calls the manager.

**Independent Test**: Run both; page shows "healthy"; stop manager → "unavailable"; wrong secret → "unauthorized"; devtools shows only same-origin requests (quickstart scenario 3). Contract: `contracts/web-api.yaml`.

### Tests for User Story 3

- [ ] T018 [P] [US3] Write failing test `apps/web/tests/health.test.ts` for `/api/health` with stubbed upstream: 200 → `healthy`; 401 → `unauthorized`; rejected/timeout/5xx → `unavailable`; missing URL or secret config → `misconfigured`; response body never contains the URL or secret

### Implementation for User Story 3

- [ ] T019 [US3] Add private `runtimeConfig` (`managerUrl`, `managerSecret`, empty defaults, no `public` entries) to `apps/web/nuxt.config.ts`
- [ ] T020 [US3] Implement `apps/web/server/utils/manager.ts`: single helper that fetches the manager with `Authorization: Bearer` header and 3 s timeout; the only place that reads `managerUrl`/`managerSecret`
- [ ] T021 [US3] Implement `apps/web/server/api/health.get.ts` mapping outcomes per `data-model.md` to `{status}` (always HTTP 200, no upstream detail); make T018 pass
- [ ] T022 [US3] Update `apps/web/app/pages/index.vue` to fetch `/api/health` and show a status badge (`UBadge`) with distinct text for healthy / unavailable / unauthorized / misconfigured

**Checkpoint**: All of US1-US3 work together end to end.

---

## Phase 6: User Story 4 - Verify code quality with one command (Priority: P3)

**Goal**: One command set lints, type-checks, and tests both projects; all green.

**Independent Test**: `pnpm lint && pnpm typecheck && pnpm test` passes on a fresh clone (quickstart scenario 4).

- [ ] T023 [US4] Verify root scripts in `package.json` run across both apps (`pnpm -r`) and fail if any app fails; fix any lint, type, or test errors surfaced in `apps/web` and `apps/manager`
- [ ] T024 [US4] Run `pnpm test` and confirm both `apps/web/tests/` and `apps/manager/tests/` report at least one passing test each (FR-009)

**Checkpoint**: Quality gate green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Write `README.md`: prerequisites (Node 24 LTS, pnpm), setup (`pnpm install`, copy `.env.example`), run commands (`pnpm dev`, per-app), check commands, architecture note (Nuxt server layer is the sole gateway, constitution Principle VI), env var table
- [ ] T026 Execute every scenario in `specs/001-repo-scaffolding/quickstart.md` manually and record any deviations; fix README or code accordingly
- [ ] T027 [P] Verify no secret leakage: grep built web output (`pnpm --filter web build`, search `apps/web/.output/public`) for `MANAGER_SECRET`, `managerSecret`, and the manager URL; expect zero matches (SC-004, FR-006)

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** (blocking) → user stories.
- **US1 (P1)** and **US2 (P1)**: independent; run in parallel after Phase 2.
- **US3 (P2)**: needs US1 (page) and US2 (manager) complete.
- **US4 (P3)**: needs tests from US1-US3 present.
- **Polish**: after all stories.
- Within a story: test (must fail) → implementation → pass.

### Parallel Opportunities

- Phase 1: T002, T003, T004 together.
- Phase 2: T005 and T006 together.
- After Phase 2: all of US1 (T008-T011) and US2 (T012-T017) in parallel by different workers.
- US2 tests T012 and T013 together; T018 can be written while US2 finishes.
- Polish: T025 and T027 together.

## Implementation Strategy

**MVP first**: Phases 1-2, then US1 (running Nuxt UI starter) → validate. Add US2, then US3 for the
end-to-end wiring and security boundary, then US4 and Polish. Commit after each task or phase.

## Notes

- CI pipelines are out of scope for this feature (see spec Assumptions).
- Pin Nuxt UI to the exact version resolved at install time and record it in `research.md`.
