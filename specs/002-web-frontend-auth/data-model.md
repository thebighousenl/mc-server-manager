# Data Model: Web Front-End Authentication

All state is in process memory or runtime config; nothing is persisted.

## Operator (runtime config `auth.users`)
| Field | Type | Rules |
|---|---|---|
| username | string | 1-64 chars, case-insensitive, unique |
| passwordHash | string | `scrypt$<salt b64>$<hash b64>`; never returned or logged |

An operator with a malformed hash is ignored with a startup error log.

## Session (in-memory Map keyed by token)
| Field | Type | Rules |
|---|---|---|
| token | string | 32 random bytes, base64url; only value in cookie |
| username | string | operator who signed in |
| createdAt | epoch ms | absolute expiry = createdAt + `maxLifetimeMs` (12 h) |
| lastSeenAt | epoch ms | idle expiry = lastSeenAt + `idleTimeoutMs` (30 min); bumped on each valid request |

Transitions: created on login → refreshed per request → deleted on logout, idle/absolute expiry (lazily on lookup), or process restart.

## Failed Attempt Counter (in-memory Map keyed by `user:<name>` / `ip:<addr>`)
| Field | Type | Rules |
|---|---|---|
| failures | number | reset on success (user key) or when window elapses |
| windowStart | epoch ms | failures are counted within a rolling window of `lockoutMs` |
| lockedUntil | epoch ms? | set when failures reach 5 |

## Config shape (`runtimeConfig.auth`, server-only)
`users` (JSON string), `idleTimeoutMs`, `maxLifetimeMs`, `maxFailures`, `lockoutMs`, `trustProxy` (boolean). Env overrides: `NUXT_AUTH_USERS`, `NUXT_AUTH_IDLE_TIMEOUT_MS`, etc.
