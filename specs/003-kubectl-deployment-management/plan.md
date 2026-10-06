# Implementation Plan: Kubernetes Minecraft Server Management

**Branch**: `003-kubectl-deployment-management` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-kubectl-deployment-management/spec.md`

## Summary

The manager back-end (`apps/manager`, Fastify) drives the `minecraft-servers` namespace by running `kubectl` (no shell, argument arrays only). The cluster objects are the only store: each server's settings are the container env vars of its `bedrock-<name>` Deployment, its port is its Traefik entrypoint, and two labels (`mc-manager/managed`, `mc-manager/protected`) mark ownership and protection. The Nuxt server layer (`apps/web`) is the only thing the browser talks to; it authenticates the operator, allow-lists routes, and forwards to the manager with the existing bearer secret plus the operator name for the audit log.

Capabilities: list and live state (poll once, push over SSE), adopt (labels only, so no pod restart), start/stop/restart, logs, console commands via the image's `send-command`, settings editing, create (PVC, Deployment, Service, IngressRouteUDP, Traefik entrypoint), and delete (stop, export world to a separate exports volume, then remove). The five existing servers are protected by label and by a hard-coded name list.

One new runtime dependency (`yaml`, to edit the Traefik HelmChartConfig safely). Everything else is Node stdlib plus what is installed.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 24 LTS (existing)

**Primary Dependencies**: Fastify 5 (manager), Nuxt 4 / Nitro / Nuxt UI (web), all existing. New: `yaml` in `apps/manager` (see Complexity Tracking). External binary: `kubectl` on the manager's PATH.

**Storage**: None in the manager. Definitions, protected flag and ownership live in cluster objects (spec Clarifications). World exports live on a cluster PVC (`mc-exports`).

**Testing**: Vitest. All cluster access goes through one injected `Kubectl` runner, so tests use a fake runner with recorded JSON fixtures; no cluster or Minecraft server needed (constitution II). A separate opt-in cluster smoke test (quickstart) runs read-only against `bighaus`.

**Target Platform**: Linux, manager and web run as today; manager host needs `kubectl` and a kubeconfig for the `bighaus` context.

**Project Type**: Web application (Nuxt UI + server layer in front of a Fastify back-end API), extending `apps/manager` and `apps/web`.

**Performance Goals**: List visible < 5 s, state change visible < 10 s (poll every 3 s, shared by all clients), console response < 3 s.

**Constraints**: Restarts are `Recreate` (brief outage) and pull `:latest` by default; operate only in namespace `minecraft-servers` plus the single HelmChartConfig `traefik` in `kube-system`; no shell; no secrets to the browser; single manager replica (in-process mutex per server and for Traefik config); single-node cluster (confirmed by the repo's design doc; RWO volumes shared by the export job and exports pod).

**Scale/Scope**: 5 servers now, tens at most; < 10 operators.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Simplicity First | Pass, 1 justified addition | No database, no custom state store, no operator/CRD, no new services in the app. One dependency (`yaml`) and one helper Deployment (`mc-exports`) justified below. |
| II. Test-First | Pass | Lifecycle, settings parsing, Traefik edit, adopt/delete guards are pure logic over a fake `Kubectl`; tasks write failing tests first. |
| III. Safe Server Operations | Pass, wording note | Typed-name confirmation, mandatory export-or-abort before every delete, protected names, stop is always graceful (no forced kill in v1). Constitution text says `save-all` then `stop`; those are Java commands. Bedrock servers stop gracefully on SIGTERM (the image sends `stop`); recommend a PATCH amendment to the constitution wording. |
| IV. Security by Default | Pass | Every route authenticated; input validated at both layers; `execFile` argument arrays only; env allow-list; no secrets in responses or logs; manager stays on localhost unless configured. |
| V. Observability | Pass | Structured action log (operator, server, action, outcome); live state and logs over SSE. |
| VI. Nuxt Server Layer as Sole Gateway | Pass | Browser calls only `/api/servers/**` on Nuxt; manager URL, secret and kubeconfig stay server-side; allow-list of forwarded routes. |
| Persisted state recoverable | Pass | No manager state; restart re-reads the cluster. In-flight multi-step actions (delete, create) are resumable from cluster state (see data-model). |

Post-design re-check: still passes; no unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-kubectl-deployment-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── servers-api.md   # browser-facing /api/servers/** (and identical manager routes)
│   └── rbac.md          # permissions the manager's kubeconfig needs
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/manager/src/
├── config.ts                 # + MC_NAMESPACE, KUBE_CONTEXT, KUBECONFIG, exports settings
├── kube/
│   ├── kubectl.ts            # execFile runner (injected), timeouts, error mapping
│   ├── objects.ts            # label scheme and name helpers
│   ├── generate.ts           # manifest generators (PVC, Deployment, Service, IngressRouteUDP)
│   ├── traefik-read.ts       # read ports from the HelmChartConfig (uses `yaml`)
│   ├── traefik.ts            # edit/validate/apply HelmChartConfig ports
│   ├── preflight.ts          # permission check reported on /health
│   └── state.ts              # Deployment+pod JSON -> ServerState
├── servers/
│   ├── validate.ts           # names, ports, settings allow-list
│   ├── protect.ts            # PROTECTED_NAMES + label check
│   ├── list.ts  poller.ts    # list/detail and the shared 3 s poller
│   ├── adopt.ts  lifecycle.ts  ready.ts  console.ts  settings.ts
│   ├── create.ts  reachability.ts  delete.ts  exports.ts
│   ├── action-log.ts         # structured action records
│   └── lock.ts               # per-server + traefik mutex
└── routes/
    ├── servers.ts  adopt.ts  lifecycle.ts  logs.ts  console.ts
    ├── settings.ts  create.ts  delete.ts  exports.ts
    └── events.ts             # SSE: state stream

apps/manager/tests/           # one test file per module above + fixtures/

apps/web/
├── server/api/servers/       # allow-listed proxy to the manager (JSON + SSE)
├── server/utils/manager.ts   # + managerFetch (only place using managerUrl/secret)
├── app/pages/servers/        # index.vue (list), [name].vue (tabs: overview, console, settings), new.vue
├── app/pages/exports.vue     # world exports and downloads
├── app/composables/          # useServers (fetch + EventSource)
├── app/components/           # ServerCard, LifecycleControls, LogPanel, ConsolePanel, PlayerList, SettingsForm, ConfirmDialog, AdoptDialog, CreateServerForm, DeleteServerDialog
└── tests/                    # proxy allow-list, operator header, SSE passthrough
```

**Structure Decision**: Extend the two existing apps; no new packages. The manager owns all cluster logic, the web server layer is a thin allow-listed gateway (constitution VI), the UI is new pages only.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `yaml` dependency | The Traefik HelmChartConfig keeps its ports inside a YAML string (`spec.valuesContent`); adding/removing `mc-<name>` entries without destroying the other five means parse and re-serialise | Regex/string splicing would corrupt the shared config that carries every server's port |
| `mc-exports` helper Deployment + PVC (`busybox:1.37`, as in the repo's restore script) | Exports must outlive the server and be downloadable; something has to mount the volume to serve files | Streaming to the browser only (rejected by clarification); a CRD or object store is far larger |
| SSE streams | Spec requires live state and logs without reload | Client polling would multiply `kubectl` calls per tab; SSE reuses the one shared poller |
