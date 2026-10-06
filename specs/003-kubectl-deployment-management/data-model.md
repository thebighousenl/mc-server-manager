# Data Model: Kubernetes Minecraft Server Management

No database. Everything below is derived from cluster objects on each read.

## Cluster objects per server `<name>`

| Object | Name | Holds |
|---|---|---|
| Deployment | `bedrock-<name>` | settings (container env), desired state (`replicas` 0/1) |
| Service | `bedrock-<name>` | UDP 19132 |
| IngressRouteUDP | `bedrock-<name>` | entrypoint `mc-<name>` |
| PersistentVolumeClaim | `bedrock-data-<name>` | the world (`/data`), 5Gi `local-path` |
| Traefik port entry | `ports.mc-<name>` in HelmChartConfig `traefik` (`kube-system`) | public UDP port |

Shared, never deleted by the manager: PVC `mc-exports` (size `MC_EXPORTS_SIZE`, default 20Gi, `local-path`) and Deployment `mc-exports` (export storage).

### Labels
Existing (set by the repo's kustomize, on all four objects; `instance` also in selectors): `app.kubernetes.io/name=bedrock`, `app.kubernetes.io/instance=<name>` (PVC also `app.kubernetes.io/component=storage`). The manager never changes these.

Added by the manager (object metadata only, never the pod template or selectors):

| Label | Value | Meaning |
|---|---|---|
| `mc-manager/managed` | `true` | the manager owns this server; set by adopt/create |
| `mc-manager/server` | `<name>` | groups the four per-server objects |
| `mc-manager/protected` | `true` | cannot be deleted (the five existing servers) |

Annotation `mc-manager/created-by: <operator>` on objects made by Create (used for rollback).

## Entities

### MinecraftServer (derived view)
| Field | Source | Rules |
|---|---|---|
| `name` | label `mc-manager/server` | `^[a-z][a-z0-9-]{1,19}$`, unique, not one of the reserved names `events`, `new`, `exports`; `bedrock-<name>` must be a valid object name |
| `port` | Traefik `ports.mc-<name>.exposedPort` | int 19132-19999 (configurable), unique across all entries |
| `worldName` | env `LEVEL_NAME` | |
| `gameMode` | env `GAMEMODE` | `survival` / `creative` / `adventure` |
| `settings` | Deployment container env | see ServerSettings |
| `desired` | `spec.replicas` | `running` (1) / `stopped` (0) |
| `state` | Deployment + pods | see state machine |
| `protected` | label OR name in `PROTECTED_NAMES` | name list is `gaitie, daan, kontgat, creative, plaskutje` |
| `managed` | label | false = "adoptable": has `app.kubernetes.io/name=bedrock` but no `mc-manager/managed` |
| `ageSeconds` | Deployment creation time | |
| `resourceVersion` | Deployment metadata | returned by detail reads; required by settings writes to detect stale edits |

### ServerSettings
Editable (allow-list, validated): `SERVER_NAME` (1-64 chars, no control chars), `LEVEL_NAME` (`^[A-Za-z0-9 _.-]{1,64}$`, must equal an existing world folder), `GAMEMODE`, `DIFFICULTY` (`peaceful|easy|normal|hard`), `MAX_PLAYERS` (1-200), `ALLOW_CHEATS`/`ONLINE_MODE`/`ALLOW_LIST` (`true|false`), `ALLOW_LIST_USERS` (`name:xuid,...`), `OPS` (`xuid,...`), `DEFAULT_PLAYER_PERMISSION_LEVEL` (`visitor|member|operator`), `VIEW_DISTANCE`, `TICK_DISTANCE` (ints in the image's range), `VERSION` (`LATEST` or `^\d+(\.\d+){2,3}$`). `LEVEL_SEED` only at create. Read-only and preserved: every other env var (e.g. `EULA`, `TRANSPORT`).

### State machine (derived, not stored)
```
stopped --start--> starting --pod Ready + "Server started"--> running
running --stop--> stopping --pod gone--> stopped
running --restart--> stopping --> starting --> running
any pod state with CrashLoopBackOff / ImagePullBackOff / Unschedulable --> failing
```
Console, players and `LEVEL_NAME` validation require `running`.

### ConsoleResult
`{ command, lines: string[], truncated: boolean }`; lines are the log output produced after the command, up to 3 s.

### WorldExport
Files on PVC `mc-exports`: `<server>-<level>-<utc yyyymmddThhmmssZ>.tgz`. Fields exposed: `file`, `sizeBytes`, `createdAt`, `server`. Never deleted by the manager.

### ManagementAction (log record, not stored)
`{ time, operator, server, action, outcome, detail? }`, actions: `adopt, start, stop, restart, command, settings, create, delete, export`. Never contains secrets.

## Multi-step operations and recovery

| Operation | Steps (in order) | If it stops midway |
|---|---|---|
| Adopt | label 4 objects | idempotent; rerun; fail if generation or pod UID changed |
| Settings | patch env (with resourceVersion) | conflict -> operator reloads; applied patch = rollout in progress, visible in state |
| Create | PVC, Deployment, Service, IngressRouteUDP, Traefik entry | rollback deletes only objects annotated `created-by` for this name; Traefik entry added last so a partial create exposes no port |
| Delete | stop, export Job (always), Traefik entry, Deployment/Service/IngressRouteUDP, PVC | PVC is deleted last; rerun resumes from what still exists; export failure aborts before anything is removed |
