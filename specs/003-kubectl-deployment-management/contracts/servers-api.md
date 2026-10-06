# Contract: Servers API

Browser-facing under `/api/servers/**` on the Nuxt server (session cookie required, `Origin` check as in feature 002). The manager exposes the same paths without the `/api` prefix (bearer secret + `X-Operator` header). The Nuxt layer only forwards the routes listed here.

Errors: `{ "error": "<code>", "message": "<human text>" }` with 400 invalid input, 401 unauthenticated, 403 refused by protection, 404 unknown server, 409 conflict/state, 422 not ready, 502 cluster unreachable. Cluster credentials and raw `kubectl` output never appear in responses.

## Read

| Method | Path | Response |
|---|---|---|
| GET | `/api/servers` | `{ servers: Server[], clusterOk: boolean, error?: string }` |
| GET | `/api/servers/events` | SSE: `event: servers` with the full list on change; `event: error` |
| GET | `/api/servers/:name` | `Server & { settings: Setting[], resourceVersion: string }` |
| GET | `/api/servers/:name/logs?follow=0\|1&tail=200` | `text/plain` or SSE lines |
| GET | `/api/servers/:name/players` | `{ online: number, max: number, players: string[] }`, 422 if not running |
| GET | `/api/exports` | `{ exports: { file, server, sizeBytes, createdAt }[] }` |
| GET | `/api/exports/:file` | binary `.tgz` stream (file name validated against `^[a-z][a-z0-9-]*-[A-Za-z0-9 _.-]+-\d{8}T\d{6}Z\.tgz$`) |

`Server`: `{ name, worldName, gameMode, port, state, desired, protected, managed, ageSeconds }`.
`Setting`: `{ key, value, editable }`.

## Act

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/servers/:name/adopt` | `{ confirm: boolean }` | `confirm:false` returns the planned label diff and changes nothing |
| POST | `/api/servers/:name/start` | | 409 if already running; response includes `warnings` (see below) |
| POST | `/api/servers/:name/stop` | `{ confirm: true }` | graceful; 400 without confirm |
| POST | `/api/servers/:name/restart` | `{ confirm: true }` | |
| POST | `/api/servers/:name/command` | `{ command: string }` | 1-256 chars, no newline; 422 if not running |
| PUT | `/api/servers/:name/settings` | `{ settings: {KEY: value}, resourceVersion: string, confirm: true }` | allow-listed keys only; 409 on stale `resourceVersion`; restarts the server |
| POST | `/api/servers` | `{ name, port?, settings, confirm: true }` | `port` omitted = next free; returns `{ server, firewall: { port, protocol: "udp" } }` |
| POST | `/api/servers/:name/reachability` | | `{ reachable: boolean }` RakNet ping from the manager host |
| DELETE | `/api/servers/:name` | `{ confirmName: string }` | `confirmName` must equal `name`; the world is always exported first; 403 for protected; 409 if not adopted ("adopt it first"); aborts if the export fails |

`start`, `restart` and `PUT settings` responses include `warnings: string[]`; when `VERSION` is `LATEST` it says the newest server version is pulled on start and may irreversibly upgrade the world.

## Invariants (each has a test)
- Any route that targets a name not matching `^[a-z][a-z0-9-]{1,19}$` or an unmanaged/unrelated workload returns 404/400 without running `kubectl`.
- `DELETE` on any of the five known names returns 403 regardless of labels.
- Mutating routes require `confirm`/`confirmName` as shown.
- Every mutating route emits one action log record.
