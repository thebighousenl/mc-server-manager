---

description: "Task list for Kubernetes Minecraft Server Management"
---

# Tasks: Kubernetes Minecraft Server Management

**Input**: Design documents from `/specs/003-kubectl-deployment-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/servers-api.md, contracts/rbac.md, quickstart.md

**Tests**: REQUIRED (constitution Principle II). Within each PR the test task comes first and must fail before the implementation task. Every module with logic has its own failing-test task first; thin route handlers are covered by route tests written in the same task as the handler (they contain no logic beyond validation and calls into a tested service). Vitest; manager tests in `apps/manager/tests/`, web tests in `apps/web/tests/`. All cluster access in tests goes through `apps/manager/tests/helpers/fake-kubectl.ts`; no test needs a cluster or a Minecraft server.

**Organization**: Grouped by user story, and every story is split into **independently reviewable PRs** (22 in total). Paths are relative to the repo root.

## Format: `[ID] [P?] [Story] Description. Files: ... Depends on: ...`

- **[P]**: can run in parallel with other [P] tasks whose dependencies are met (no shared files).
- **Files**: the only files the task may create or edit.
- **Depends on**: tasks that must be **merged** first (so the dependency is on `main`, never on an unmerged branch).

## How the PRs work

1. **One PR = one row of the table below**, containing exactly its tasks. Branch `003-pr<NN>-<slug>` from the latest `main` once its dependencies are merged. PRs with no dependency on each other can be reviewed and merged in any order or in parallel.
2. **Each PR is self-contained**: its tests and implementation land together (test commit first, then implementation), `pnpm lint && pnpm typecheck && pnpm test` pass on the branch, no existing behaviour changes, and the app still starts. Nothing in a PR is dead code for longer than the next PR in its chain (PR-02/03/04 are foundations used by PR-05 onward).
3. **Reviewer scope**: a reviewer needs only the PR diff, this file, and the contract sections named in the PR row. Shared files that several PRs extend (`apps/manager/src/app.ts`: one `register` line; `apps/web/server/utils/servers-routes.ts`: new rows; `apps/web/app/pages/servers/[name].vue`: a new tab) are listed in each task's **Files** so overlaps are visible.
4. **Risk ordering**: read-only PRs first (1-7), then label-only (8), then actions on running servers (10, 14), then creation (16-17), then deletion last (19-20). Deletion ships only after protection (PR-02, PR-08) is merged.
5. **Live checks**: tasks named `*-verify` run the matching quickstart steps on the real cluster, only on a throwaway server (`zz-test`) except the read-only check and the single-server adopt dry-run. Evidence goes in the PR description.
6. Commit format: `type(application-part)[story-no]: description`, e.g. `feat(manager)[3]: add lifecycle actions`.
7. New dependencies: only `yaml` (PR-05), justified in that PR's description (constitution I).

## PR overview

| PR | Title | Story | Tasks | Merges after | Scope |
|----|-------|-------|-------|--------------|---------------------|
| PR-01 | Cluster access foundation | Phase 1 | T001-T009 | none | Config for cluster access, the injected `kubectl` runner, startup permission preflight reported on `/health`. |
| PR-02 | Naming, validation and protection | Phase 2 | T010-T015 | PR-01 | Pure, fully unit-tested modules: object names and labels, input validation, protected-server rule. |
| PR-03 | State derivation, locks and action log | Phase 2 | T016-T022 | PR-01, PR-02 | Pure modules with recorded fixtures: server state from Deployment and pod JSON, per-server mutex, structured action log. |
| PR-04 | Web gateway foundation | Phase 2 | T023-T027 | none | The only place in the web app that talks to the manager for servers: allow-listed route table, operator header, JSON and stream forwarding. |
| PR-05 | Server list and detail API (manager) | US1 | T028-T031 | PR-01, PR-03 | Read-only manager routes `GET /servers`, `GET /servers/:name`. |
| PR-06 | Live updates (manager) | US1 | T032-T033 | PR-05 | Shared 3 s poller and `GET /servers/events` SSE. |
| PR-07 | Server list page (web) | US1 | T034-T037 | PR-04, PR-05, PR-06 | Operators see all servers live. |
| PR-08 | Adopt existing servers (manager) | US2 | T038-T041 | PR-01, PR-02, PR-03 | Label-only adoption with before/after proof that nothing restarted, and the protection rule enforced. |
| PR-09 | Adopt UI and protected badge (web) | US2 | T042-T045 | PR-04, PR-07, PR-08 | Operators review the diff, adopt each server, and see which are protected. |
| PR-10 | Lifecycle and logs (manager) | US3 | T046-T053 | PR-01, PR-02, PR-03, PR-05 | Start, stop, restart, log streaming, game-ready detection. |
| PR-11 | Lifecycle and logs UI (web) | US3 | T054-T056 | PR-04, PR-07, PR-10 | Start/stop/restart buttons with confirmation and the version warning; log panel on the server page. |
| PR-12 | Console and players (manager) | US4 | T057-T059 | PR-01, PR-02, PR-03, PR-05 | `send-command` based console and `list` parsing. |
| PR-13 | Console UI (web) | US4 | T060-T062 | PR-04, PR-11, PR-12 | Console tab with command input and players list. |
| PR-14 | Settings editing (manager) | US5 | T063-T065 | PR-01, PR-02, PR-03, PR-10 | Allow-listed env edits with conflict detection and the restart confirmation. |
| PR-15 | Settings UI (web) | US5 | T066-T068 | PR-04, PR-11, PR-14 | Settings tab: edit allowed values, read-only for the rest, confirm restart. |
| PR-16 | Traefik entrypoint editing (manager) | US6 | T069-T070 | PR-01, PR-02, PR-03, PR-05 | The riskiest shared edit, isolated in its own PR: add/remove `mc-<name>` ports with preservation checks. |
| PR-17 | Create server (manager) | US6 | T071-T076 | PR-01, PR-02, PR-03, PR-05, PR-16 | Manifest generators, ordered create with rollback, reachability check. |
| PR-18 | Create server UI (web) | US6 | T077-T080 | PR-04, PR-15, PR-17 | Create form, firewall reminder and reachability check. |
| PR-19 | World exports (manager) | US7 | T081-T082 | PR-01, PR-02, PR-03, PR-05 | Exports volume, one-off export Job, list and download. |
| PR-20 | Delete server (manager) | US7 | T083-T084 | PR-01, PR-02, PR-03, PR-05, PR-10, PR-16, PR-19 | Protected-server refusal, typed-name confirmation, mandatory export-then-delete order. |
| PR-21 | Delete and exports UI (web) | US7 | T085-T088 | PR-04, PR-07, PR-20 | Delete dialog with typed-name confirmation and the mandatory export; exports page with downloads. |
| PR-22 | Docs, permissions and cutover | Phase 10 | T089-T093 | PR-21 | Operator-facing docs and the cutover checklist from the OneDev repo to the manager. |


---

## Phase 1: Setup

### PR-01: Cluster access foundation

Config for cluster access, the injected `kubectl` runner, startup permission preflight reported on `/health`. No new endpoints, no behaviour change for existing features.

- [X] T001 [PR-01] Write failing tests for the new settings in `apps/manager/tests/config.test.ts`: `MC_NAMESPACE` (default `minecraft-servers`, must be a valid DNS label), `KUBE_CONTEXT` and `KUBECONFIG` (optional, passed through), `KUBECTL_BIN` (default `kubectl`), `MC_PORT_MIN`/`MC_PORT_MAX` (defaults 19132/19999, min <= max, valid ports), `MC_POLL_MS` (default 3000, >= 500), `MC_EXPORTS_SIZE` (default `20Gi`, a Kubernetes quantity) and `MC_EXPORTS_STORAGE_CLASS` (default `local-path`). Existing assertions stay green. Files: `apps/manager/tests/config.test.ts`. Depends on: none
- [X] T002 [PR-01] Extend `Config` and `loadConfig` in `apps/manager/src/config.ts` with those settings (group under `config.kube` and `config.ports`); invalid values throw with the variable name, as today. Files: `apps/manager/src/config.ts`. Depends on: T001
- [X] T003 [P] [PR-01] Write failing tests `apps/manager/tests/kubectl.test.ts` with an injected fake `execFile`: args are passed as an array (never a shell string; a value like `a; rm -rf /` stays one argument); `--context`/`--namespace` are prepended from config; `KUBECONFIG` env is set only when configured; timeout kills the process and rejects with `KubectlError` code `timeout`; stderr maps to `KubectlError` codes `unreachable` (connection refused / unable to connect), `forbidden`, `notfound`, `conflict`, else `failed`; the error `message` never contains stderr verbatim for `unreachable`/`forbidden` beyond a short fixed text (no kubeconfig content or tokens); namespace/resource guard (SC-009, FR-002): `run` rejects with `KubectlError` code `refused`, without executing, any args naming a namespace other than the configured one (the only exception is `kube-system` for a get/replace/apply of the single `helmchartconfig traefik`), `--all-namespaces`/`-A`, or resource kinds outside the allow-list (deployments, pods, services, persistentvolumeclaims, ingressrouteudps, jobs, helmchartconfigs). Files: `apps/manager/tests/kubectl.test.ts`. Depends on: T002
- [X] T004 [PR-01] Implement `apps/manager/src/kube/kubectl.ts`: `interface Kubectl { run(args, opts?: {stdin?, timeoutMs?, namespace?: string | null}): Promise<{stdout, stderr, code}>; spawn(args, opts?): ChildProcess }`, `createKubectl(config, execFileImpl = execFile)`, `KubectlError`. `spawn` is for long-lived streams (logs, downloads) and uses the same prefixing and the same namespace/resource guard. No shell anywhere. Files: `apps/manager/src/kube/kubectl.ts`. Depends on: T003
- [X] T005 [P] [PR-01] Create the shared test double `apps/manager/tests/helpers/fake-kubectl.ts`: `fakeKubectl(rules)` implements the `Kubectl` interface (see `apps/manager/src/kube/kubectl.ts`), each rule is `{ match: (args: string[]) => boolean, result: {stdout, stderr?, code?} | (args) => result }`, unmatched calls throw, `.calls` records every args array. Also `fixture(name)` that reads `apps/manager/tests/fixtures/<name>.json`. Files: `apps/manager/tests/helpers/fake-kubectl.ts`. Depends on: T004
- [X] T006 [P] [PR-01] Write failing tests `apps/manager/tests/preflight.test.ts` (fake kubectl): `preflight(kubectl)` runs one `auth can-i` per verb of each row of `contracts/rbac.md` including `patch` on services, persistentvolumeclaims and ingressrouteudps and `watch` on deployments, pods and jobs (verb, resource, namespace, resourceName) and returns `{ ok: boolean, missing: string[] }` where each missing item is a readable `verb resource (namespace)`; unreachable cluster returns `{ ok: false, reachable: false, missing: [] }`; never throws. Files: `apps/manager/tests/preflight.test.ts`. Depends on: T005, T004
- [X] T007 [PR-01] Implement `apps/manager/src/kube/preflight.ts` (the permission table as a constant list, cached result for 10 s) to pass the tests. Files: `apps/manager/src/kube/preflight.ts`. Depends on: T006
- [X] T008 [PR-01] Extend `apps/manager/tests/health.test.ts`: `GET /health` still returns `status: ok` plus `cluster: { reachable, missing }` from the injected kubectl; a cluster failure does not change the HTTP 200 (the manager itself is up) but sets `reachable:false`; unauthenticated still 401. `buildApp(config, { kubectl })` takes the runner as a dependency. Files: `apps/manager/tests/health.test.ts`. Depends on: T007, T005
- [X] T009 [PR-01] Wire it: `apps/manager/src/app.ts` accepts `deps: { kubectl: Kubectl }`, `apps/manager/src/routes/health.ts` adds the `cluster` field, `apps/manager/src/index.ts` builds the real runner from config. Add the new variables with comments to `.env.example` (`MC_NAMESPACE`, `KUBE_CONTEXT`, `KUBECONFIG`, `KUBECTL_BIN`, `MC_PORT_MIN`, `MC_PORT_MAX`, `MC_POLL_MS`). Files: `apps/manager/src/app.ts`, `apps/manager/src/routes/health.ts`, `apps/manager/src/index.ts`, `.env.example`. Depends on: T008


---

## Phase 2: Foundational

### PR-02: Naming, validation and protection

Pure, fully unit-tested modules: object names and labels, input validation, protected-server rule. Nothing is exposed yet; consumed from PR-05 on.

- [X] T010 [P] [PR-02] Write failing tests `apps/manager/tests/objects.test.ts`: `names("daan")` returns `{ deployment: "bedrock-daan", service: "bedrock-daan", route: "bedrock-daan", pvc: "bedrock-data-daan", entrypoint: "mc-daan" }`; label constants `mc-manager/managed`, `mc-manager/server`, `mc-manager/protected`, `app.kubernetes.io/name=bedrock`, `app.kubernetes.io/instance`; `managerLabels(name, {protected})` returns only the `mc-manager/*` labels; `selectorForServer(name)` builds the `app.kubernetes.io/instance=<name>,app.kubernetes.io/name=bedrock` selector. Files: `apps/manager/tests/objects.test.ts`. Depends on: T002
- [X] T011 [PR-02] Implement `apps/manager/src/kube/objects.ts` (names, label keys, `managerLabels`, `selectorForServer`; no manifest generators yet, those arrive with create in PR-17). Files: `apps/manager/src/kube/objects.ts`. Depends on: T010
- [X] T012 [P] [PR-02] Write failing tests `apps/manager/tests/validate.test.ts` from data-model.md and contracts/servers-api.md: `validateName` (`^[a-z][a-z0-9-]{1,19}$`, rejects uppercase, spaces, `..`, trailing `-`, 21 chars, and the reserved names `events`, `new` and `exports` which would collide with routes and pages); `validatePort(port, {min, max, taken})`; `validateSettings(partial, mode)` with `mode` either `create` or `update` accepts only the allow-listed keys with their rules (`GAMEMODE` enum, `MAX_PLAYERS` 1-200, booleans as `"true"|"false"`, `ALLOW_LIST_USERS` format, `OPS` xuids, `VERSION` `LATEST` or dotted numbers, `LEVEL_NAME` pattern) and rejects unknown keys, `EULA` and `TRANSPORT`; `LEVEL_SEED` is accepted only in `create` mode and rejected in `update` mode; `validateCommand` (1-256 chars, no newline/NUL, trimmed non-empty); `validateExportFile` (`^[a-z][a-z0-9-]*-[A-Za-z0-9 _.-]+-\d{8}T\d{6}Z\.tgz$`, no `/` or `..`). Each returns `{ ok: true, value } | { ok: false, message }`. Files: `apps/manager/tests/validate.test.ts`. Depends on: T002
- [X] T013 [PR-02] Implement `apps/manager/src/servers/validate.ts` to pass the tests. Files: `apps/manager/src/servers/validate.ts`. Depends on: T012
- [X] T014 [P] [PR-02] Write failing tests `apps/manager/tests/protect.test.ts`: `isProtected(name, labels)` is true for each of `gaitie, daan, kontgat, creative, plaskutje` even with empty labels, true for any server with `mc-manager/protected=true`, false otherwise; `PROTECTED_NAMES` is exactly those five and frozen. Files: `apps/manager/tests/protect.test.ts`. Depends on: none
- [X] T015 [PR-02] Implement `apps/manager/src/servers/protect.ts` (`PROTECTED_NAMES`, `isProtected`). Files: `apps/manager/src/servers/protect.ts`. Depends on: T014

### PR-03: State derivation, locks and action log

Pure modules with recorded fixtures: server state from Deployment and pod JSON, per-server mutex, structured action log.

- [X] T016 [P] [PR-03] Record fixtures under `apps/manager/tests/fixtures/` (hand-written JSON in `kubectl get -o json` shape, no real cluster data): `deploy-list.json` (daan running with labels, creative running, `gaitie` unmanaged but `app.kubernetes.io/name=bedrock`, one unrelated `nginx` Deployment), `pods-running.json`, `pods-starting.json`, `pods-crashloop.json`, `pods-none.json`, `deploy-stopped.json` (replicas 0). Files: `apps/manager/tests/fixtures/deploy-list.json`, `apps/manager/tests/fixtures/pods-running.json`, `apps/manager/tests/fixtures/pods-starting.json`, `apps/manager/tests/fixtures/pods-crashloop.json`, `apps/manager/tests/fixtures/pods-none.json`, `apps/manager/tests/fixtures/deploy-stopped.json`. Depends on: T005
- [X] T017 [PR-03] Write failing tests `apps/manager/tests/state.test.ts`: `deriveServers(deployments, pods, {traefikPorts})` returns `Server[]` per contracts/servers-api.md; excludes the `nginx` Deployment; state is `stopped` (replicas 0, no pods), `stopping` (replicas 0, pod still present), `starting` (pod not Ready, or Ready but `serverStarted` false), `running`, `failing` (CrashLoopBackOff/ImagePullBackOff/Unschedulable); `managed:false` for the unmanaged `gaitie` fixture; `protected` uses `isProtected`; settings come from container env with `editable` per the validate allow-list; `ageSeconds` from creation time with an injected clock. Files: `apps/manager/tests/state.test.ts`. Depends on: T016, T011, T015, T013
- [X] T018 [PR-03] Implement `apps/manager/src/kube/state.ts` (`deriveServers`, `ServerState` union, `Server` and `Setting` types shared by the routes). `serverStarted` is passed in per server (log-marker detection is added in PR-10). Files: `apps/manager/src/kube/state.ts`. Depends on: T017
- [X] T019 [P] [PR-03] Write failing tests `apps/manager/tests/lock.test.ts`: `withLock(key, fn)` serialises calls with the same key in call order, runs different keys concurrently, releases on throw, and the special key `traefik` is shared by all callers. Files: `apps/manager/tests/lock.test.ts`. Depends on: none
- [X] T020 [PR-03] Implement `apps/manager/src/servers/lock.ts` (promise-chain mutex map). Files: `apps/manager/src/servers/lock.ts`. Depends on: T019
- [X] T021 [P] [PR-03] Write failing tests `apps/manager/tests/action-log.test.ts`: `logAction(logger, { operator, server, action, outcome, detail })` emits one structured record with exactly those fields plus `time`, never emits keys named `token`, `secret`, `kubeconfig`, `password`, and truncates `detail` to 200 chars. Files: `apps/manager/tests/action-log.test.ts`. Depends on: none
- [X] T022 [PR-03] Implement `apps/manager/src/servers/action-log.ts`. Files: `apps/manager/src/servers/action-log.ts`. Depends on: T021

### PR-04: Web gateway foundation

The only place in the web app that talks to the manager for servers: allow-listed route table, operator header, JSON and stream forwarding. No pages yet.

- [X] T023 [PR-04] Write failing tests `apps/web/tests/servers-gateway.test.ts` (node environment, injected `fetch`): `forward(request, deps)` only forwards (method, path) pairs present in the allow-list table; unknown routes return 404 without calling fetch; `:name` must match `^[a-z][a-z0-9-]{1,19}$` else 400 without calling fetch; the manager URL is built from the path, never from client-supplied host; adds `Authorization: Bearer <secret>` and `X-Operator: <username>`; strips the response `set-cookie` and any header not on a short allow-list; manager 5xx and network errors map to 502 `{ error: "unavailable" }`; JSON bodies are size-limited (16 KiB); `Content-Type: text/event-stream` responses are streamed through unbuffered. Also assert `authorize()` from `apps/web/server/utils/authorize.ts` rejects `/api/servers` without a session. Files: `apps/web/tests/servers-gateway.test.ts`. Depends on: none
- [X] T024 [PR-04] Create `apps/web/server/utils/servers-routes.ts`: the allow-list table `{ method, pattern, stream? }[]`, initially only `GET /api/servers` (rows are added by the story PRs; this file is explicitly extended by PR-06, 08, 10, 12, 14, 16, 18, 19, 20). Files: `apps/web/server/utils/servers-routes.ts`. Depends on: T023
- [X] T025 [PR-04] Implement `apps/web/server/utils/manager.ts` addition `managerFetch(path, init, operator)` (the only reader of `managerUrl`/`managerSecret` besides `checkManager`) and `apps/web/server/utils/servers-gateway.ts` (`forward`) to pass the tests. Files: `apps/web/server/utils/manager.ts`, `apps/web/server/utils/servers-gateway.ts`. Depends on: T023, T024
- [X] T026 [PR-04] Create the catch-all Nitro handler `apps/web/server/api/servers/[...path].ts` that calls `forward` with `event.context.auth.username`, plus the same for the bare `apps/web/server/api/servers/index.ts`; both are thin adapters (decision C1 of feature 002). Files: `apps/web/server/api/servers/[...path].ts`, `apps/web/server/api/servers/index.ts`. Depends on: T025
- [X] T027 [PR-04] Extend `apps/web/tests/env-loading.test.ts` only if needed so a missing `NUXT_MANAGER_URL`/`NUXT_MANAGER_SECRET` yields 502 `misconfigured` from the gateway rather than a crash (add one test and the minimal branch in `servers-gateway.ts`). Files: `apps/web/tests/env-loading.test.ts`, `apps/web/server/utils/servers-gateway.ts`. Depends on: T026


---

## Phase 3: US1 (P1) MVP

**Goal**: operators see every Minecraft server in the namespace with live state. **Independent test**: five servers listed with correct state; unreachable cluster shows an error; unrelated workloads hidden. 🎯 MVP = PR-01 to PR-07.

### PR-05: Server list and detail API (manager)

Read-only manager routes `GET /servers`, `GET /servers/:name`. Safe to ship alone: nothing in the UI calls them yet.

- [X] T028 [US1] [PR-05] Write failing tests `apps/manager/tests/servers-list.test.ts` (fake kubectl with the PR-03 fixtures): `listServers()` runs exactly one `get deploy,pods` call plus one `get helmchartconfig traefik -n kube-system -o json` call, merges ports from the parsed `valuesContent`, returns the five-server shape from spec US1 scenario 1, hides the `nginx` Deployment, and on unreachable cluster returns `{ servers: [], clusterOk: false, error }` instead of an empty-looking success; `getServer(name)` returns 404 for unknown/unrelated names and does not call kubectl for an invalid name. Files: `apps/manager/tests/servers-list.test.ts`. Depends on: T018, T004, T005
- [X] T029 [US1] [PR-05] Implement `apps/manager/src/servers/list.ts` (`listServers`, `getServer`) and a minimal read-only `readTraefikPorts(kubectl)` in `apps/manager/src/kube/traefik-read.ts` (parse with `yaml`; add `yaml` to `apps/manager/package.json` dependencies and justify it in the PR description per constitution I). Files: `apps/manager/src/servers/list.ts`, `apps/manager/src/kube/traefik-read.ts`, `apps/manager/package.json`, `pnpm-lock.yaml`. Depends on: T028
- [X] T030 [US1] [PR-05] Write failing route tests `apps/manager/tests/servers-routes.test.ts`: `GET /servers` and `GET /servers/daan` return the contract shapes with a valid bearer, 401 without, 400 for `/servers/Bad_Name` and `/servers/..%2f` with zero kubectl calls, 404 for an unknown name, 502 `{error:"unavailable"}` when the cluster is unreachable, and no response body contains stderr text. Files: `apps/manager/tests/servers-routes.test.ts`. Depends on: T029
- [X] T031 [US1] [PR-05] Implement `apps/manager/src/routes/servers.ts` and register it in `apps/manager/src/app.ts`. Files: `apps/manager/src/routes/servers.ts`, `apps/manager/src/app.ts`. Depends on: T030

### PR-06: Live updates (manager)

Shared 3 s poller and `GET /servers/events` SSE. Read-only; reviewable on its own.

- [X] T032 [US1] [PR-06] Write failing tests `apps/manager/tests/poller.test.ts` (fake timers): one shared poller regardless of subscriber count, polling starts with the first subscriber and stops after the last leaves, emits only when the list changed (deep compare), a failing poll emits `error` once and keeps retrying, no overlapping polls. Files: `apps/manager/tests/poller.test.ts`. Depends on: T029
- [X] T033 [US1] [PR-06] Implement `apps/manager/src/servers/poller.ts` and the SSE route `apps/manager/src/routes/events.ts` (`event: servers` with the full list, `event: error`; heartbeat comment every 15 s), registered in `apps/manager/src/app.ts`. Add a route test in `apps/manager/tests/events.test.ts` (writes the first event immediately, closes cleanly on client abort). Files: `apps/manager/src/servers/poller.ts`, `apps/manager/src/routes/events.ts`, `apps/manager/tests/events.test.ts`, `apps/manager/src/app.ts`. Depends on: T032

### PR-07: Server list page (web)

Operators see all servers live. Completes the MVP: read-only, no cluster changes possible.

- [X] T034 [US1] [PR-07] Add rows to `apps/web/server/utils/servers-routes.ts`: `GET /api/servers/events` (stream), `GET /api/servers/:name`; add the matching cases to `apps/web/tests/servers-gateway.test.ts` (SSE passthrough, 404 for unlisted). Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T031, T033
- [X] T035 [US1] [PR-07] Write failing component tests `apps/web/tests/servers-page.test.ts` (happy-dom, mocked `$fetch`/`EventSource`): five cards with name, world, mode, port, state badge, age; `failing` state is visibly distinct; `clusterOk:false` shows the error banner and not an empty list; an `servers` SSE event updates a card without reload; reconnect after an SSE error; `ConfirmDialog` emits `confirm`/`cancel`, keeps the confirm button disabled until the typed text equals `requireText` when that prop is set, and shows an optional `warnings` list. Files: `apps/web/tests/servers-page.test.ts`. Depends on: T034
- [X] T036 [US1] [PR-07] Create `apps/web/app/components/ServerCard.vue`, the generic `apps/web/app/components/ConfirmDialog.vue` (props `title`, `body`, `warnings?`, `requireText?`; reused by every later story), `apps/web/app/composables/useServers.ts` (initial fetch + `EventSource` with backoff) and `apps/web/app/pages/servers/index.vue` using Nuxt UI; link from the existing home page `apps/web/app/pages/index.vue`. Files: `apps/web/app/components/ServerCard.vue`, `apps/web/app/components/ConfirmDialog.vue`, `apps/web/app/composables/useServers.ts`, `apps/web/app/pages/servers/index.vue`, `apps/web/app/pages/index.vue`. Depends on: T035
- [ ] T037 [US1] [PR-07] Run quickstart "Read-only cluster check" against the real cluster and paste the result (five servers, states and ports match the README table; labels match research.md decision 3) into the PR description. Record any label difference as a comment in `specs/003-kubectl-deployment-management/research.md` decision 3. Files: `specs/003-kubectl-deployment-management/research.md`. Depends on: T036


---

## Phase 4: US2 (P2)

**Goal**: take over the five running servers without a restart and mark them protected. **Independent test**: adopt a server; pod UIDs and generation unchanged; delete refused.

### PR-08: Adopt existing servers (manager)

Label-only adoption with before/after proof that nothing restarted, and the protection rule enforced. Ships adopt endpoint; nothing calls it until PR-09.

- [X] T038 [US2] [PR-08] Write failing tests `apps/manager/tests/adopt.test.ts` (fake kubectl): `planAdopt(name)` returns the label diff for the four objects (Deployment, Service, IngressRouteUDP, PVC) and issues only `get` calls; `adopt(name, {confirm:true})` runs `kubectl label` (never `patch`/`apply`/`scale`/`rollout`) with `mc-manager/managed=true`, `mc-manager/server=<name>`, and `mc-manager/protected=true` for the five names; it reads Deployment `metadata.generation` and pod UIDs before and after and, if either changed, returns an error and logs `outcome: failed`; it is idempotent (second run reports "no changes"); refuses a name without `app.kubernetes.io/name=bedrock` objects (404); takes the per-server lock; logs one action record. Files: `apps/manager/tests/adopt.test.ts`. Depends on: T018, T020, T022, T011, T015, T005
- [X] T039 [US2] [PR-08] Implement `apps/manager/src/servers/adopt.ts` to pass the tests. Files: `apps/manager/src/servers/adopt.ts`. Depends on: T038
- [X] T040 [US2] [PR-08] Write failing route tests `apps/manager/tests/adopt-routes.test.ts`: `POST /servers/:name/adopt` with `{confirm:false}` returns the plan and makes no write call; `{confirm:true}` applies; missing `confirm` is 400; the `X-Operator` header lands in the action log. Files: `apps/manager/tests/adopt-routes.test.ts`. Depends on: T039
- [X] T041 [US2] [PR-08] Implement `apps/manager/src/routes/adopt.ts`, register in `apps/manager/src/app.ts`. Files: `apps/manager/src/routes/adopt.ts`, `apps/manager/src/app.ts`. Depends on: T040

### PR-09: Adopt UI and protected badge (web)

Operators review the diff, adopt each server, and see which are protected.

- [X] T042 [US2] [PR-09] Add the `POST /api/servers/:name/adopt` row to `apps/web/server/utils/servers-routes.ts` with a gateway test in `apps/web/tests/servers-gateway.test.ts`. Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T041
- [X] T043 [US2] [PR-09] Write failing component tests `apps/web/tests/adopt-ui.test.ts`: unmanaged servers show an "Adopt" action that first displays the planned label changes from `confirm:false`; confirming calls `confirm:true`; protected servers show a lock badge; no delete control is rendered for them. Files: `apps/web/tests/adopt-ui.test.ts`. Depends on: T042, T036
- [X] T044 [US2] [PR-09] Create `apps/web/app/components/AdoptDialog.vue` (uses `ConfirmDialog`) and update `apps/web/app/components/ServerCard.vue` for the badge and adopt action. Files: `apps/web/app/components/AdoptDialog.vue`, `apps/web/app/components/ServerCard.vue`. Depends on: T043
- [ ] T045 [US2] [PR-09] Run quickstart steps 8-9 against a copy-safe check: adopt one existing server with `confirm:false` and confirm only label additions are shown; do NOT adopt the other four until the PR is approved. Paste evidence (pod UIDs unchanged) in the PR description. Files: none (evidence goes in the PR description). Depends on: T044


---

## Phase 5: US3 (P3)

**Goal**: start, stop, restart, logs. **Independent test**: stop then start a throwaway server; clean quit in logs; confirmation required.

### PR-10: Lifecycle and logs (manager)

Start, stop, restart, log streaming, game-ready detection. First PR that changes running servers; each action requires confirmation and is locked and logged.

- [ ] T046 [US3] [PR-10] Hand-create the throwaway server `zz-test` for the manual checks of PRs 10-15: copy the OneDev repo's `servers/daan` overlay to `servers/zz-test` locally (rename `daan` to `zz-test` everywhere, set `LEVEL_NAME` to `zz-test`, use a spare port) and `kubectl apply -k` it. For the Traefik entry, do NOT apply the repo copy of `cluster/traefik-helmchartconfig.yaml` (it would overwrite any live difference): run `kubectl -n kube-system get helmchartconfig traefik -o yaml`, add only the `mc-zz-test` entry, and apply that. Warn anyone using the cluster: Traefik restarts and all HTTP ingress is interrupted for a few seconds, for this change and again when you remove the entry afterwards. Do not commit or push to the OneDev repo (its deploy job would deploy it, and would later remove the entry). Nothing in this repository changes; note the port used in the PR description. Files: none (evidence goes in the PR description). Depends on: none
- [X] T047 [US3] [PR-10] Write failing tests `apps/manager/tests/lifecycle.test.ts` (fake kubectl): `stop` requires `confirm:true`, runs `scale --replicas=0` then waits until no pod matches `selectorForServer`, returns `warnings: []`; `start` runs `scale --replicas=1` and returns the latest-version warning when `VERSION` is `LATEST` or unset (FR-023); `restart` runs `rollout restart` with the same warning; start on a running server is 409; all take the per-server lock and log one action; a protected server can be stopped/started normally; a wait timeout returns an error that names the server, leaves the state as reported by the cluster (stopping) and logs `outcome: failed`; there is no forced-kill path (a `force` field in the body is rejected as an unknown field, FR-005); unmanaged servers are refused with a message to adopt first. Files: `apps/manager/tests/lifecycle.test.ts`. Depends on: T018, T020, T022, T011, T005
- [X] T048 [US3] [PR-10] Implement `apps/manager/src/servers/lifecycle.ts`. Files: `apps/manager/src/servers/lifecycle.ts`. Depends on: T047
- [X] T049 [P] [US3] [PR-10] Write failing tests `apps/manager/tests/ready.test.ts`: `serverStarted(logText)` is true when the log contains `Server started.`, false for a log that only has the earlier startup lines; `startedTracker` remembers a pod UID once seen started, so a later log longer than 200 lines whose "Server started." line is no longer in the tail still reports started for that UID; a new pod UID (restart) starts as not started; `listServers` calls `logs` only for Ready pods whose UID is not yet tracked as started and never for tracked ones (assert zero log calls in steady state). Files: `apps/manager/tests/ready.test.ts`. Depends on: none
- [X] T050 [US3] [PR-10] Implement `apps/manager/src/servers/ready.ts` (`serverStarted`, `startedTracker`) and feed it into `listServers` (`apps/manager/src/servers/list.ts`: for `Ready` pods whose UID is not tracked as started, run `logs` (capped at 2000 lines) and pass `serverStarted`; tracked UIDs cost no call), updating `apps/manager/tests/servers-list.test.ts` for the extra call. Files: `apps/manager/src/servers/ready.ts`, `apps/manager/src/servers/list.ts`, `apps/manager/tests/servers-list.test.ts`. Depends on: T049, T029
- [X] T051 [US3] [PR-10] Write failing tests `apps/manager/tests/logs.test.ts`: `GET /servers/:name/logs?tail=200` returns text; `follow=1` returns SSE lines from `kubectl logs -f` via `spawn`, kills the child on client abort (assert `kill` called), caps `tail` at 1000, refuses an unknown name without spawning. Files: `apps/manager/tests/logs.test.ts`. Depends on: T031, T004
- [X] T052 [US3] [PR-10] Implement `apps/manager/src/routes/lifecycle.ts` (start, stop, restart per contracts/servers-api.md, bodies validated, 400 without `confirm` for stop/restart) and `apps/manager/src/routes/logs.ts`; register in `apps/manager/src/app.ts`; add route tests in `apps/manager/tests/lifecycle-routes.test.ts`. Files: `apps/manager/src/routes/lifecycle.ts`, `apps/manager/src/routes/logs.ts`, `apps/manager/tests/lifecycle-routes.test.ts`, `apps/manager/src/app.ts`. Depends on: T048, T051, T050
- [ ] T053 [US3] [PR-10] Verify against `zz-test` only (quickstart step 5, time it for SC-005): stop and start through the manager API with curl, confirm a clean quit in the logs and that the default termination grace period is enough, confirm `running` is reported only after "Server started.". Record the result in `specs/003-kubectl-deployment-management/research.md` decision 5 and the PR description. Files: `specs/003-kubectl-deployment-management/research.md`. Depends on: T052, T046

### PR-11: Lifecycle and logs UI (web)

Start/stop/restart buttons with confirmation and the version warning; log panel on the server page.

- [X] T054 [US3] [PR-11] Add rows for `POST start|stop|restart` and `GET logs` (stream) to `apps/web/server/utils/servers-routes.ts`, with tests in `apps/web/tests/servers-gateway.test.ts`. Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T052
- [X] T055 [US3] [PR-11] Write failing component tests `apps/web/tests/lifecycle-ui.test.ts`: stop and restart open `ConfirmDialog` and only call the API after confirmation; any `warnings` in a response are shown; buttons are disabled in transitional states; logs panel renders streamed lines and closes its `EventSource` on unmount. Files: `apps/web/tests/lifecycle-ui.test.ts`. Depends on: T054, T036
- [X] T056 [US3] [PR-11] Create the server detail page `apps/web/app/pages/servers/[name].vue` (overview tab), `apps/web/app/components/LifecycleControls.vue`, `apps/web/app/components/LogPanel.vue`; add a link from `ServerCard.vue`. Files: `apps/web/app/pages/servers/[name].vue`, `apps/web/app/components/LifecycleControls.vue`, `apps/web/app/components/LogPanel.vue`, `apps/web/app/components/ServerCard.vue`. Depends on: T055


---

## Phase 6: US4 (P4)

**Goal**: console commands and player list. **Independent test**: `list` returns players within 3 s; refused when not running.

### PR-12: Console and players (manager)

`send-command` based console and `list` parsing. Refuses unless the server is running.

- [X] T057 [P] [US4] [PR-12] Add fixture `apps/manager/tests/fixtures/list-output.txt` files (`list-two-players.txt`, `list-none.txt`) containing realistic Bedrock server log lines for the `list` command, copied from a real log in the PR author's environment with player names replaced. Files: `apps/manager/tests/fixtures/list-two-players.txt`, `apps/manager/tests/fixtures/list-none.txt`. Depends on: none
- [X] T058 [US4] [PR-12] Write failing tests `apps/manager/tests/console.test.ts` (fake kubectl): `sendCommand(name, command)` validates with `validateCommand`, refuses when state is not `running` (422), runs `exec deploy/bedrock-<name> -- send-command <words...>` with each whitespace-separated word as its own argv entry (assert a command like `say hi; rm -rf /` becomes plain arguments, no shell), polls the log and returns as soon as output appears, capped at 2 s (SC-006), returns `{ command, lines, truncated }`; `getPlayers(name)` sends `list` and parses `{ online, max, players }` using the fixtures; logs one action record per command with the command text truncated. Files: `apps/manager/tests/console.test.ts`. Depends on: T057, T018, T013, T022, T005, T029
- [X] T059 [US4] [PR-12] Implement `apps/manager/src/servers/console.ts` and routes `apps/manager/src/routes/console.ts` (`POST /servers/:name/command`, `GET /servers/:name/players`) with route tests `apps/manager/tests/console-routes.test.ts`; register in `apps/manager/src/app.ts`. Files: `apps/manager/src/servers/console.ts`, `apps/manager/src/routes/console.ts`, `apps/manager/tests/console-routes.test.ts`, `apps/manager/src/app.ts`. Depends on: T058

### PR-13: Console UI (web)

Console tab with command input and players list.

- [X] T060 [US4] [PR-13] Add rows for `POST command` and `GET players` to `apps/web/server/utils/servers-routes.ts` with gateway tests in `apps/web/tests/servers-gateway.test.ts`. Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T059
- [X] T061 [US4] [PR-13] Write failing component tests `apps/web/tests/console-ui.test.ts`: command submit shows returned lines, a 422 shows "server not ready", the input rejects newlines client-side, a note explains that `allowlist`/`op` commands are runtime-only when `ALLOW_LIST_USERS`/`OPS` are set (use Settings for durable changes), players list renders. Files: `apps/web/tests/console-ui.test.ts`. Depends on: T060, T056
- [X] T062 [US4] [PR-13] Create `apps/web/app/components/ConsolePanel.vue`, `apps/web/app/components/PlayerList.vue` and add a Console tab to `apps/web/app/pages/servers/[name].vue`. Files: `apps/web/app/components/ConsolePanel.vue`, `apps/web/app/components/PlayerList.vue`, `apps/web/app/pages/servers/[name].vue`. Depends on: T061


---

## Phase 7: US5 (P5)

**Goal**: edit settings that persist. **Independent test**: change `MAX_PLAYERS`, confirm restart, value survives a second restart.

### PR-14: Settings editing (manager)

Allow-listed env edits with conflict detection and the restart confirmation.

- [X] T063 [US5] [PR-14] Write failing tests `apps/manager/tests/settings.test.ts` (fake kubectl): `updateSettings(name, {settings, resourceVersion, confirm})` requires `confirm:true`; validates through `validateSettings` (unknown keys, `EULA`, `TRANSPORT` rejected, nothing sent to kubectl); builds one `patch deploy/bedrock-<name> --type=strategic` whose body contains the container env entries and `metadata.resourceVersion`; a `conflict` error from kubectl becomes 409 `stale` with the message to reload; other env vars (EULA, TRANSPORT, LEVEL_SEED) are not touched; `LEVEL_NAME` changes are accepted only when state is `running` and `exec ls /data/worlds` lists the folder, otherwise 422; returns the latest-version warning when `VERSION` is `LATEST`/unset; per-server lock and one action log record; read side: `getServer` marks keys `editable` per the allow-list. Files: `apps/manager/tests/settings.test.ts`. Depends on: T018, T013, T020, T022, T005
- [X] T064 [US5] [PR-14] Implement `apps/manager/src/servers/settings.ts` and `apps/manager/src/routes/settings.ts` (`PUT /servers/:name/settings`) with route tests `apps/manager/tests/settings-routes.test.ts`; register in `apps/manager/src/app.ts`. Include `resourceVersion` in the `GET /servers/:name` response (extend `apps/manager/src/servers/list.ts` and its test). Files: `apps/manager/src/servers/settings.ts`, `apps/manager/src/routes/settings.ts`, `apps/manager/tests/settings-routes.test.ts`, `apps/manager/src/app.ts`, `apps/manager/src/servers/list.ts`, `apps/manager/tests/servers-list.test.ts`. Depends on: T063, T050
- [ ] T065 [US5] [PR-14] Verify against `zz-test` only (quickstart step 6): change `MAX_PLAYERS` through the manager API with curl, confirm the restart, the value in effect, restart again and still in effect (SC-007); confirm a stale `resourceVersion` gives 409. Evidence in the PR description. Files: none (evidence goes in the PR description). Depends on: T064, T046

### PR-15: Settings UI (web)

Settings tab: edit allowed values, read-only for the rest, confirm restart.

- [X] T066 [US5] [PR-15] Add the `PUT /api/servers/:name/settings` row to `apps/web/server/utils/servers-routes.ts` with a gateway test in `apps/web/tests/servers-gateway.test.ts`. Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T064
- [X] T067 [US5] [PR-15] Write failing component tests `apps/web/tests/settings-ui.test.ts`: only `editable` keys render inputs, others are read-only; client-side validation mirrors the enum/range rules; save opens `ConfirmDialog` stating the server will restart and showing any `warnings`; a 409 shows "changed elsewhere, reload"; only changed keys are sent. Files: `apps/web/tests/settings-ui.test.ts`. Depends on: T066, T056
- [X] T068 [US5] [PR-15] Create `apps/web/app/components/SettingsForm.vue` and add a Settings tab to `apps/web/app/pages/servers/[name].vue`. Files: `apps/web/app/components/SettingsForm.vue`, `apps/web/app/pages/servers/[name].vue`. Depends on: T067


---

## Phase 8: US6 (P6)

**Goal**: create a new server and its public port safely. **Independent test**: create `zz-test`; the five existing entries and pods untouched.

### PR-16: Traefik entrypoint editing (manager)

The riskiest shared edit, isolated in its own PR: add/remove `mc-<name>` ports with preservation checks. Pure logic plus fake-kubectl tests; nothing calls it yet.

- [X] T069 [US6] [PR-16] Write failing tests `apps/manager/tests/traefik.test.ts` using a fixture `apps/manager/tests/fixtures/helmchartconfig-traefik.json` containing the five real entries (ports 19332, 19132, 19134, 19232, 19140): `addPort(config, name, port)` appends `mc-<name>` with `port`, `exposedPort`, `protocol: UDP`, `expose.default: true` and leaves all five existing entries deep-equal; duplicate name or port is rejected; `removePort` removes only that entry and refuses a name in `PROTECTED_NAMES`; `nextFreePort` skips used ports within min/max; `applyTraefik(kubectl, mutate)` under the `traefik` lock: reads the object, runs `apply --dry-run=server`, aborts without writing if the dry run fails or if any non-target entry changed, writes with the read `resourceVersion` (conflict means 409 and nothing written); output YAML parses back to the same ports map. Files: `apps/manager/tests/traefik.test.ts`, `apps/manager/tests/fixtures/helmchartconfig-traefik.json`. Depends on: T020, T015, T013, T005, T029
- [X] T070 [US6] [PR-16] Implement `apps/manager/src/kube/traefik.ts` (import and reuse `readTraefikPorts` from `traefik-read.ts`; do not edit existing files). Files: `apps/manager/src/kube/traefik.ts`. Depends on: T069

### PR-17: Create server (manager)

Manifest generators, ordered create with rollback, reachability check. Never touches the five existing servers (tests assert it).

- [X] T071 [US6] [PR-17] Write failing tests `apps/manager/tests/generate.test.ts`: `generateObjects({name, settings})` returns PVC, Deployment, Service and IngressRouteUDP equal to the template in research.md decision 9 (check each field: `Recreate`, `imagePullPolicy: Always`, env order `EULA`, `VERSION`, `TRANSPORT` then settings, resources, `/data` mount, claim `bedrock-data-<name>`, selector and labels including `app.kubernetes.io/instance`, IngressRouteUDP entrypoint `mc-<name>` and service `bedrock-<name>`); a contract test compares the output for `daan` settings with a stored rendered fixture `apps/manager/tests/fixtures/daan-rendered.json` produced once with `kubectl kustomize servers/daan` from the OneDev repo and converted to JSON. Files: `apps/manager/tests/generate.test.ts`, `apps/manager/tests/fixtures/daan-rendered.json`. Depends on: T011, T013
- [X] T072 [US6] [PR-17] Implement `apps/manager/src/kube/generate.ts`. Files: `apps/manager/src/kube/generate.ts`. Depends on: T071
- [X] T073 [US6] [PR-17] Write failing tests `apps/manager/tests/create.test.ts` (fake kubectl): requires `confirm:true`; rejects duplicate name (including an existing unmanaged server) and taken/out-of-range ports with no write call; applies in order PVC, Deployment, Service, IngressRouteUDP, then Traefik entry last; on a failure at any step deletes only objects annotated `mc-manager/created-by` for this name and removes the Traefik entry only if this call added it, and reports the failure; never issues a write call naming any of the five protected servers; omitted port picks `nextFreePort`; returns `{ server, firewall: { port, protocol: "udp" } }`; takes the `traefik` and per-server locks; one action log record. Files: `apps/manager/tests/create.test.ts`. Depends on: T072, T070, T022, T020, T005, T029
- [X] T074 [P] [US6] [PR-17] Write failing tests `apps/manager/tests/reachability.test.ts` against a local UDP responder started in the test: `pingServer(host, port)` sends a RakNet unconnected ping, returns `true` when the responder answers with an unconnected pong, `false` after a 2 s timeout when nothing answers, and `false` (no throw) for a malformed reply; the host must be the configured public address, never client supplied. Files: `apps/manager/tests/reachability.test.ts`. Depends on: none
- [X] T075 [US6] [PR-17] Implement `apps/manager/src/servers/reachability.ts` (one UDP RakNet unconnected-ping function using `node:dgram`, 2 s timeout) to pass the tests; add `MC_PUBLIC_HOST` (the node address used for the outside check) to `apps/manager/src/config.ts` with a test in `apps/manager/tests/config.test.ts`. Files: `apps/manager/src/servers/reachability.ts`, `apps/manager/src/config.ts`, `apps/manager/tests/config.test.ts`. Depends on: T074
- [X] T076 [US6] [PR-17] Implement `apps/manager/src/servers/create.ts` and the routes `apps/manager/src/routes/create.ts` (`POST /servers`, `POST /servers/:name/reachability`) with route tests `apps/manager/tests/create-routes.test.ts`; register in `apps/manager/src/app.ts`. Files: `apps/manager/src/servers/create.ts`, `apps/manager/src/routes/create.ts`, `apps/manager/tests/create-routes.test.ts`, `apps/manager/src/app.ts`. Depends on: T073, T075

### PR-18: Create server UI (web)

Create form, firewall reminder and reachability check.

- [X] T077 [US6] [PR-18] Add rows `POST /api/servers` and `POST /api/servers/:name/reachability` to `apps/web/server/utils/servers-routes.ts` with gateway tests. Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T076
- [X] T078 [US6] [PR-18] Write failing component tests `apps/web/tests/create-ui.test.ts`: name/port/settings validated client-side with the same rules; submit shows `ConfirmDialog` stating that Traefik restarts and all HTTP ingress on the cluster, not only Minecraft, is interrupted for a few seconds; success view shows "open UDP <port> in the node and provider firewall" and a "Check from outside" button calling reachability; server errors (duplicate, port taken) are shown inline. Files: `apps/web/tests/create-ui.test.ts`. Depends on: T077, T068
- [X] T079 [US6] [PR-18] Create `apps/web/app/components/CreateServerForm.vue` and `apps/web/app/pages/servers/new.vue`, add a "New server" button to `apps/web/app/pages/servers/index.vue`. Files: `apps/web/app/components/CreateServerForm.vue`, `apps/web/app/pages/servers/new.vue`, `apps/web/app/pages/servers/index.vue`. Depends on: T078
- [ ] T080 [US6] [PR-18] Run quickstart steps 3-4 on throwaway `zz-test`: pod ages of the five existing servers unchanged, Traefik entries intact (`kubectl -n kube-system get helmchartconfig traefik -o yaml`), outside check works after opening the port. Evidence in PR description. Files: none (evidence goes in the PR description). Depends on: T079


---

## Phase 9: US7 (P7)

**Goal**: delete non-protected servers with a world export. **Independent test**: delete `zz-test` with export; the five are refused.

### PR-19: World exports (manager)

Exports volume, one-off export Job, list and download. Non-destructive; reviewable before delete exists.

- [X] T081 [US7] [PR-19] Write failing tests `apps/manager/tests/exports.test.ts` (fake kubectl): `ensureExportsVolume()` creates PVC `mc-exports` (size from `MC_EXPORTS_SIZE`, storage class from `MC_EXPORTS_STORAGE_CLASS`) and Deployment `mc-exports` (`busybox:1.37`, `sleep`) only if absent and never deletes them; `exportWorld(name, level)` requires the server stopped, creates a Job mounting the server PVC read-only and `mc-exports`, running `tar czf /exports/<name>-<level>-<utc>.tgz -C /data/worlds <level>` (argument array, level validated), waits for completion, deletes the Job, returns the file name, and returns an error (not a partial success) when the Job fails or times out; `listExports()` and `readExport(file)` validate the name with `validateExportFile` before any exec and stream via `spawn`; no export function can name a PVC other than the server's own and `mc-exports`. Files: `apps/manager/tests/exports.test.ts`. Depends on: T013, T020, T022, T005, T004, T029
- [X] T082 [US7] [PR-19] Implement `apps/manager/src/servers/exports.ts` and routes `apps/manager/src/routes/exports.ts` (`GET /exports`, `GET /exports/:file` streaming `application/gzip`) with route tests `apps/manager/tests/exports-routes.test.ts` (bad file names are 400 with zero kubectl calls); register in `apps/manager/src/app.ts`. Files: `apps/manager/src/servers/exports.ts`, `apps/manager/src/routes/exports.ts`, `apps/manager/tests/exports-routes.test.ts`, `apps/manager/src/app.ts`. Depends on: T081

### PR-20: Delete server (manager)

Protected-server refusal, typed-name confirmation, mandatory export-then-delete order. Highest-risk PR: review with the invariants in contracts/servers-api.md open.

- [X] T083 [US7] [PR-20] Write failing tests `apps/manager/tests/delete.test.ts` (fake kubectl): for each of `gaitie, daan, kontgat, creative, plaskutje`, with and without the protected label and with and without the managed label, `deleteServer` returns 403 and the fake records zero write calls; `confirmName` must equal `name` exactly (case, whitespace) else 400 with zero writes; the world is always exported: stop, export, and only after export success delete, and a body containing `exportWorld` is rejected as an unknown field; a failed export returns an error and the fake shows no `delete` call at all; a server without `mc-manager/managed=true` that is not protected is refused with 409 "adopt it first" and zero writes; order of deletes is Traefik entry, IngressRouteUDP, Service, Deployment, PVC last; rerun after a partial delete finishes remaining objects, and a fresh service instance with no memory of the earlier attempt completes it while `listServers` meanwhile still shows the server (FR-021); the port is free (`nextFreePort`) afterwards; takes `traefik` and server locks; one action log record per attempt including refusals. Files: `apps/manager/tests/delete.test.ts`. Depends on: T082, T070, T015, T020, T022, T005, T048, T029
- [X] T084 [US7] [PR-20] Implement `apps/manager/src/servers/delete.ts` and route `apps/manager/src/routes/delete.ts` (`DELETE /servers/:name`) with route tests `apps/manager/tests/delete-routes.test.ts` (403 for each of the five names regardless of body; malformed body, or a body other than `{ confirmName }`, is 400); register in `apps/manager/src/app.ts`. Files: `apps/manager/src/servers/delete.ts`, `apps/manager/src/routes/delete.ts`, `apps/manager/tests/delete-routes.test.ts`, `apps/manager/src/app.ts`. Depends on: T083

### PR-21: Delete and exports UI (web)

Delete dialog with typed-name confirmation and the mandatory export; exports page with downloads.

- [X] T085 [US7] [PR-21] Add rows `DELETE /api/servers/:name`, `GET /api/exports`, `GET /api/exports/:file` (stream) to `apps/web/server/utils/servers-routes.ts` with gateway tests (file name validated before forwarding; non-matching name is 400). Files: `apps/web/server/utils/servers-routes.ts`, `apps/web/tests/servers-gateway.test.ts`. Depends on: T026, T084
- [X] T086 [US7] [PR-21] Write failing component tests `apps/web/tests/delete-ui.test.ts`: delete control is not rendered for protected servers; the dialog warns that the world is deleted and states that it will be exported first (no opt-out control), and keeps the confirm button disabled until the exact name is typed (via `ConfirmDialog` `requireText`); a failed export shows the error and the server remains; `apps/web/tests/exports-ui.test.ts`: list renders and download links hit `/api/exports/<file>`. Files: `apps/web/tests/delete-ui.test.ts`, `apps/web/tests/exports-ui.test.ts`. Depends on: T085, T036
- [X] T087 [US7] [PR-21] Create `apps/web/app/components/DeleteServerDialog.vue`, `apps/web/app/pages/exports.vue`, add the delete action to `apps/web/app/pages/servers/[name].vue` and an "Exports" link to `apps/web/app/pages/servers/index.vue`. Files: `apps/web/app/components/DeleteServerDialog.vue`, `apps/web/app/pages/exports.vue`, `apps/web/app/pages/servers/[name].vue`, `apps/web/app/pages/servers/index.vue`. Depends on: T086
- [ ] T088 [US7] [PR-21] Run quickstart step 7 on throwaway `zz-test` (never on a real server): wrong name refused, export file downloadable, objects and `mc-zz-test` Traefik entry gone, others intact; then attempt delete on each of the five names and confirm 403. Evidence in PR description. Files: none (evidence goes in the PR description). Depends on: T087


---

## Phase 10: Polish

### PR-22: Docs, permissions and cutover

Operator-facing docs and the cutover checklist from the OneDev repo to the manager. Documentation and sample RBAC only.

- [X] T089 [P] [PR-22] Add a ready-to-apply Role/RoleBinding/ServiceAccount example `docs/rbac/mc-manager-role.yaml` implementing `specs/003-kubectl-deployment-management/contracts/rbac.md` (including the `patch` and `watch` verbs added after analysis), and a `kubectl auth can-i --as` check list in the same directory README. Files: `docs/rbac/mc-manager-role.yaml`, `docs/rbac/README.md`. Depends on: none
- [X] T090 [P] [PR-22] Update `README.md`: manager cluster variables, how to install `kubectl` and provide a kubeconfig on the manager host, running with kubectl/kubeconfig, protected servers, the restart/latest-version warning, export and download flow, "what the manager does not do" (firewall, world import, backups). Files: `README.md`. Depends on: none
- [X] T091 [P] [PR-22] Write `specs/003-kubectl-deployment-management/cutover.md`: ordered checklist to retire the OneDev job without touching worlds (adopt each server and verify, disable the `deploy servers` job trigger, archive the repo read-only, confirm no deploy re-applies manifests, rollback = re-enable the job), with the explicit rule that the five servers are never deleted. Files: `specs/003-kubectl-deployment-management/cutover.md`. Depends on: none
- [X] T092 [P] [PR-22] Amend `.specify/memory/constitution.md` principle III wording from Java `save-all`/`stop` to "graceful shutdown (the server's own stop path) before any forced kill" with a Sync Impact Report and version bump 1.1.0 to 1.1.1 (PATCH). Files: `.specify/memory/constitution.md`. Depends on: none
- [ ] T093 [PR-22] Run the whole quickstart once end to end (including steps 5-6 on a throwaway `zz-test`: confirm a clean quit in the logs after stop and that the default termination grace period is enough, and record that result in `specs/003-kubectl-deployment-management/research.md` decision 5), then `pnpm lint && pnpm typecheck && pnpm test`; record results in `specs/003-kubectl-deployment-management/verification.md`. Files: `specs/003-kubectl-deployment-management/verification.md`, `specs/003-kubectl-deployment-management/research.md`. Depends on: T089, T090, T091, T092, T088

---

## Dependencies and parallel work

The authoritative dependency list is the **Merges after** column above (generated from the task dependencies). In words: PR-01 first; then PR-02, PR-03 and PR-04 in any order (PR-04 needs nothing from the manager); PR-05 and PR-06 complete the manager read API; PR-07 completes the MVP. Every other manager PR (08, 10, 12, 14, 16, 19) needs only PR-01 to PR-03 plus PR-05 where it reads server state, and every web PR needs PR-04 plus its manager PR plus the previous UI PR.

Parallel review opportunities: PR-02 / PR-03 / PR-04 are independent of each other once PR-01 is merged (PR-04 needs nothing from the manager). After PR-05: manager PRs 08, 10, 12, 14, 16 and 19 are independent of each other and can be reviewed in parallel; each web PR waits only for its own manager PR and the previous UI PR. Within a PR, tasks marked [P] touch different files.

## Implementation strategy

1. **MVP (PR-01 to PR-07)**: read-only visibility. Safe to deploy at once and already useful; proves cluster access, permissions, and the gateway.
2. **Take ownership (PR-08, PR-09)**: label-only adoption of the five servers, protection in force before any other write path exists.
3. **Operate (PR-10 to PR-15)**: lifecycle, console, settings. Each is a manager PR followed by its UI PR.
4. **Provision and retire (PR-16 to PR-21)**: create, then exports, then delete last. After PR-21 and the cutover checklist, the OneDev job can be retired (PR-22).
5. Stop after any PR and the system is consistent: no PR leaves a half-wired feature that the UI exposes.
