# Implementation Plan: Web Front-End Authentication

**Branch**: `002-web-frontend-auth` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-web-frontend-auth/spec.md`

## Summary

Gate the whole Nuxt app behind username/password sign-in. Operators are defined in server-side runtime config (scrypt hashes). A successful sign-in creates an in-memory server-side session referenced by an opaque HttpOnly cookie. A Nitro server middleware rejects every `/api/**` request without a valid session (except sign-in and `/api/health`), and a global route middleware redirects pages to `/login`. Failed attempts are throttled in memory. No new dependencies: `node:crypto` (scrypt, timingSafeEqual, randomBytes) plus h3 cookie helpers already shipped with Nuxt.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 24 LTS (`.nvmrc`)

**Primary Dependencies**: Nuxt 4 / Nitro / h3, Nuxt UI (existing); no additions

**Storage**: In-process memory only (sessions, throttle counters); operators from runtime config. Lost on restart by design (spec FR-007)

**Testing**: Vitest (existing `apps/web` setup); pure utils tested with injected clock, no Nuxt runtime

**Target Platform**: Linux container in the cluster behind HTTPS ingress

**Project Type**: Web application (Nuxt UI + server layer), `apps/web` only

**Performance Goals**: Sign-in < 1 s; per-request session check is a Map lookup

**Constraints**: Fail closed when unconfigured; single replica assumed (in-memory state is per-process); secrets only in server-only runtime config

**Scale/Scope**: < 10 operators, a handful of concurrent sessions

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Simplicity First | Pass | Zero new dependencies; in-memory stores; no abstractions beyond three small utils |
| II. Test-First | Pass | Auth is named in the principle; tasks write failing tests for password verify, session store, throttle, middleware before implementation |
| III. Safe Server Operations | N/A | No destructive operations added |
| IV. Security by Default | Pass | Implements it: all control endpoints authenticated, secrets never logged/returned |
| V. Observability | Pass | Structured auth log events (FR-011) |
| VI. Nuxt Server Layer as Sole Gateway | Pass | Auth enforced in the Nuxt server layer; manager untouched and still internal |

Post-design re-check: still passes. No complexity violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-web-frontend-auth/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── auth-api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── nuxt.config.ts                  # + runtimeConfig.auth (users, timeouts, lockout)
├── server/
│   ├── middleware/auth.ts          # gate every /api/** except public paths
│   ├── plugins/auth-config.ts      # startup check: log error if no users configured
│   ├── api/auth/
│   │   ├── login.post.ts
│   │   ├── logout.post.ts
│   │   └── me.get.ts
│   └── utils/
│       ├── auth-config.ts          # typed config reader (only place reading runtimeConfig.auth)
│       ├── password.ts             # scrypt verify / hash / parseUsers
│       ├── sessions.ts             # in-memory store, idle + absolute expiry
│       ├── authenticate.ts         # pure login logic (+ throttle)
│       ├── authorize.ts            # pure gate logic for middleware
│       ├── logout.ts
│       ├── throttle.ts             # failed-attempt lockout
│       └── auth-log.ts             # structured audit log lines
├── scripts/hash-password.mjs       # imports password.ts to generate an operator hash
├── app/
│   ├── plugins/auth-expired.ts     # redirect on mid-session 401
│   ├── middleware/auth.global.ts   # redirect to /login?redirect=
│   ├── pages/login.vue
│   └── pages/index.vue             # + sign-out button
└── tests/                          # one file per util + helpers/auth.ts (fake clock, test config)
```

**Structure Decision**: Everything lives in the existing `apps/web` app. The manager app is not modified.

## Complexity Tracking

No violations.
