# Research: Kubernetes Minecraft Server Management

Facts come from the existing manifests repo (https://github.com/thebighousenl/minecraft-servers: `base/`, `servers/*`, `cluster/`, `scripts/`, README and design doc), read in full on 2026-10-06: context `bighaus`, single k3s node, namespace `minecraft-servers`, image `itzg/minecraft-bedrock-server:latest`, objects `bedrock-<name>`, PVC `bedrock-data-<name>`, entrypoint `mc-<name>`, Traefik HelmChartConfig `traefik` in `kube-system`. Items marked **verify** need a read-only check against the live cluster (it may differ from the repo); none blocks the design.

## Decisions

### 1. Cluster access: `kubectl` via `execFile`, injected runner
- **Decision**: One `Kubectl` interface (`run(args, {stdin?, timeoutMs}) -> {stdout, stderr, code}`) backed by `child_process.execFile('kubectl', args)` with `--context`/`--namespace`/`KUBECONFIG` from config. No shell, ever. Tests inject a fake.
- **Rationale**: The user asked for kubectl; argument arrays make injection structurally impossible (constitution IV) and a fake runner makes every flow testable (II).
- **Alternatives**: `@kubernetes/client-node` (new heavy dependency, user asked for kubectl); shelling out with strings (injection risk).

### 2. Definition lives in the cluster (clarification A)
- **Decision**: Settings = container env of Deployment `bedrock-<name>`; port = Traefik entrypoint `mc-<name>` and IngressRouteUDP; flags = labels `mc-manager/managed=true`, `mc-manager/protected=true`, `mc-manager/server=<name>` on all four per-server objects (labels on object metadata only, never the pod template).
- **Rationale**: Nothing to back up or drift; adding metadata labels does not change `metadata.generation`, so adoption causes no rollout (SC-003).
- **Alternatives**: manager database or ConfigMap copy (rejected in clarification).

### 3. Discovering servers
- **Decision**: Every repo-made object carries `app.kubernetes.io/name=bedrock` and `app.kubernetes.io/instance=<name>` (kustomize `includeSelectors: true`, so the instance label is also in the Deployment selector, pod template and Service selector). Managed servers = those with `mc-manager/managed=true`; Deployments with `app.kubernetes.io/name=bedrock` but without it are listed as "adoptable". The manager never edits selectors or pod-template labels (immutable / would restart).
- **Rationale**: Unrelated workloads never appear (FR-002); labels are verified from the repo, not guessed.
- **Verify**: the live objects carry the same labels (`kubectl -n minecraft-servers get deploy,svc,pvc,ingressrouteudp --show-labels`).

### 4. State model
- **Decision**: `stopped` (replicas 0, no pods) / `stopping` / `starting` (pod exists, not Ready or log lacks "Server started") / `running` (pod Ready) / `failing` (CrashLoopBackOff, ImagePullBackOff, unschedulable). Derived from one `kubectl get deploy,pods -l ... -o json` per poll.
- **Rationale**: single call per 3 s regardless of client count (SC-001/SC-002).
- **Alternatives**: `kubectl get -w` watch processes (more moving parts, reconnect handling); per-client polling (call multiplication).

### 4a. Game-ready detection (revised)
- **Decision**: "Server started." is searched in the full log (capped at 2000 lines) only for a Ready pod whose UID has not yet been seen started; once seen, the pod UID is remembered in a map, so a long-running server never flips back to `starting` when the line scrolls out of the last lines, and steady state costs one `get deploy,pods` call per poll.

### 5. Lifecycle
- **Decision**: stop = `kubectl scale --replicas=0`, wait for pod gone; start = scale 1; restart = `kubectl rollout restart`. Graceful shutdown relies on the image trapping SIGTERM and issuing `stop`.
- **Repo facts that shape this**: the Deployment uses `strategy: Recreate` (restart and settings saves mean a short outage, never two pods on one volume), `imagePullPolicy: Always` with `VERSION=LATEST`, so every start or restart pulls the newest image and Bedrock version; the README says world upgrades are one-way. The manager therefore warns before start, restart and settings save, and exposes `VERSION` as an editable setting so an operator can pin a version.
- **No probes**: pods have no readiness probe, so pod Ready means only that the container started; `running` also requires the log line "Server started" (decision 4). No forced kill is offered in v1: a timed-out stop is reported with the logs.
- **Verify**: on a throwaway server, confirm the log shows a clean quit after scale-down and the default 30 s termination grace is enough; if not, adoption stays label-only and a settings change (which restarts) may raise `terminationGracePeriodSeconds` for that server later.
- **Rationale**: no reconciler exists once the CI job is retired, so a manual scale to 0 persists (spec assumption).

### 6. Console and players (Bedrock)
- **Decision**: `kubectl exec deploy/bedrock-<n> -- send-command <word> <word>...` (argument array; reject newlines and empty commands), then read new log lines (`--since-time` captured just before sending) as soon as output appears, capped at 2 s. Players: send `list`, parse "There are N/M players online:" and the following name line from the log. Both refuse when the server is not `running`.
- **Rationale**: this is the image's documented mechanism (README: "output appears in the logs").
- **Verify**: exact `list` output format on the running version; fixture-driven parser tests.

### 7. Settings
- **Decision**: Editable keys (allow-list): `SERVER_NAME, LEVEL_NAME, GAMEMODE, DIFFICULTY, MAX_PLAYERS, ALLOW_CHEATS, ONLINE_MODE, ALLOW_LIST, ALLOW_LIST_USERS, OPS, DEFAULT_PLAYER_PERMISSION_LEVEL, VIEW_DISTANCE, TICK_DISTANCE, VERSION`; `LEVEL_SEED` settable at create only. Other env vars (e.g. `EULA`, `TRANSPORT`) are shown read-only and preserved. Save = strategic-merge patch of the container env including `metadata.resourceVersion` (conflict if changed meanwhile), after operator confirmation; patching the pod template restarts the server, which is how the change takes effect.
- **Rationale**: the image regenerates `server.properties` (and allow-list/ops from env) on every start, so env is the only durable place. Concurrent edit protection via resourceVersion.
- **Note**: console `allowlist add` / `op` changes are runtime-only if `ALLOW_LIST_USERS`/`OPS` are set; the UI says so and points to Settings for durable changes.
- **`LEVEL_NAME` rule**: changes are only accepted while the server is running and `/data/worlds/<name>` exists (checked with `exec ls`); otherwise rejected (spec US5 scenario 3).

### 8. Traefik entrypoints (shared, high blast radius)
- **Decision**: `HelmChartConfig/traefik` in `kube-system`: read as JSON, parse `spec.valuesContent` with `yaml`, add/remove `ports.mc-<name>` (`port`, `exposedPort`, `protocol: UDP`, `expose.default: true`), then `kubectl apply --dry-run=server` first, then replace with the read `resourceVersion` (conflict-safe), under a global mutex. The live structure is exactly the repo's `cluster/traefik-helmchartconfig.yaml`: `valuesContent` holds only a `ports:` map of five `mc-<name>` entries; the YAML round trip is lossless for this content. Refuse if the result would drop or change any other server's entry. Warn that Traefik restarts for a few seconds.
- **Rationale**: one wrong write breaks all five live servers; validation + preservation check is mandatory (FR-014).
- **Port rules**: unique, range 19132–19999 (configurable), not equal to any existing `exposedPort`.

### 9. Create
- **Decision**: Manager generates, from a template transcribed from the repo's `base/`: PVC (`local-path`, RWO, 5Gi, `component: storage`), Deployment (`itzg/minecraft-bedrock-server:latest`, `Recreate`, `tty`/`stdin` true, `EULA=TRUE`, `VERSION=LATEST`, `TRANSPORT=raknet`, port `bedrock` 19132/UDP, requests 250m CPU / 512Mi, memory limit 2Gi, `/data` mount, env from settings), Service (ClusterIP `19132/UDP`), IngressRouteUDP (`traefik.io/v1alpha1`, entrypoint `mc-<name>`), each with `app.kubernetes.io/name=bedrock`, `app.kubernetes.io/instance=<name>` (also in selectors) and the manager labels, applies them, then the Traefik entry last. Order and rollback: if any step fails, delete only what this create made (all carry `mc-manager/server=<name>` and a `mc-manager/created-by` annotation).
- **Verify**: a contract test asserts the generator reproduces the repo's rendered `daan` objects (`kubectl kustomize servers/daan`), and the opt-in cluster smoke test compares against the live `daan` objects, so the template cannot drift from what the five servers run today.
- **Firewall**: not automatable; after create show "open UDP <port>" and an outside reachability check (RakNet ping, as in the repo's `scripts/raknet-ping.py`, reimplemented as one small UDP function in the manager).

### 10. Delete and export
- **Decision**: Refuse if protected (label or known name). Otherwise: typed-name confirm → stop (graceful) → always: run a one-off Job (image `busybox:1.37`, the helper image the repo's `restore-world.sh` already uses) mounting the server PVC read-only and `mc-exports` to `tar czf /exports/<name>-<level>-<utc>.tgz`; wait for success, abort the delete on failure → delete Traefik entry, then Deployment, Service, IngressRouteUDP, PVC. Downloads stream `cat` of the file from the `mc-exports` pod through manager and Nuxt.
- **Rationale**: stopping first gives a consistent copy without `save hold` timing games; export-then-delete in that order means a failure never leaves a deleted world with no copy.
- **`mc-exports`**: Deployment (busybox, sleep) + PVC `mc-exports` (size `MC_EXPORTS_SIZE`, default 20Gi, storage class `MC_EXPORTS_STORAGE_CLASS`, default `local-path`), created on first export, never deleted by the manager. Same-node assumption for RWO is confirmed: the design doc states a single node with `local-path`, and `restore-world.sh` already mounts the RWO volume in a helper pod beside a running server. There are no backups today, so exports are the only safety net.

### 11. Adoption
- **Decision**: For each of the five: read the four objects, show the diff (labels to add), `kubectl label` them, record generation/pod UIDs before and after and fail the action if either changed. The five names are also hard-coded as protected in code, so removing a label cannot expose them.

### 12. Live updates
- **Decision**: Manager runs one shared poller (3 s) and exposes SSE `GET /servers/events` (state diffs) and `GET /servers/:name/logs?follow=1` (spawns `kubectl logs -f`, killed on disconnect). Nuxt proxies both as streams.
- **Alternatives**: WebSocket (more machinery, no browser-to-server need beyond text).

### 13. Gateway and audit
- **Decision**: Nuxt route allow-list of (method, path pattern); name parameter regex-checked; adds `X-Operator: <username>` to the manager request; manager trusts it only because the bearer secret already passed. Each mutating action logs `{operator, server, action, outcome}`.

### 14. Permissions
- **Decision**: Dedicated ServiceAccount/Role limited to `minecraft-servers` plus a `resourceNames: [traefik]` rule in `kube-system`; the manager runs `kubectl auth can-i` checks at startup and reports gaps on its health output (see `contracts/rbac.md`).

## Open follow-ups (not blocking)
- Constitution III wording (Java `save-all`) → PATCH amendment.
- Where the manager runs (host vs in-cluster) is a deploy-time choice; both work with a kubeconfig or in-cluster service account.
- Removing old exports is manual (`kubectl exec` into `mc-exports`); a UI action can come later.
