# MC Server Manager

pnpm monorepo: `apps/web` (Nuxt 4 + Nuxt UI) and `apps/manager` (Fastify).

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm (version pinned via `packageManager` in `package.json`; enable with `corepack enable`)

## Setup

```bash
pnpm install
cp .env.example .env   # set MANAGER_SECRET and NUXT_MANAGER_SECRET to the same value (>= 32 chars)
```

## Run

```bash
pnpm dev                       # web + manager together
pnpm --filter web dev          # web only      -> http://localhost:3000
pnpm --filter manager dev      # manager only  -> http://127.0.0.1:3001
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Sign-in

The web UI and every `/api/**` route (except `POST /api/auth/login` and `GET /api/health`) require
sign-in. Operators are defined in `NUXT_AUTH_USERS`; with none configured nobody can sign in.

Create an operator:

```bash
pnpm --filter web hash-password '<password>'   # prints scrypt$<salt>$<hash>
# then in .env:
NUXT_AUTH_USERS='[{"username":"alice","passwordHash":"<hash>"}]'
```

Sessions and lockout counters live in process memory: restarting the web app signs everyone out, and
**only a single web replica is supported**. In the cluster, supply `NUXT_AUTH_USERS` from a Secret
and set `NUXT_AUTH_TRUST_PROXY=true` behind the ingress so the lockout sees real client IPs (leave it
`false` when the app is directly exposed, otherwise clients can spoof `X-Forwarded-For`).

## Architecture

The Nuxt server layer is the **sole gateway** to the manager (constitution Principle VI). The
browser only talks to the web app (port 3000); Nuxt server routes call the manager using
`NUXT_MANAGER_URL` and `NUXT_MANAGER_SECRET`. The manager is never exposed to the browser and
requires `Authorization: Bearer <secret>` on its requests.

## Environment variables

| Variable | Used by | Default in `.env.example` | Description |
|---|---|---|---|
| `MANAGER_SECRET` | manager | placeholder | Shared bearer secret, >= 32 chars. Must equal `NUXT_MANAGER_SECRET`. |
| `MANAGER_HOST` | manager | `127.0.0.1` | Interface the manager binds to. |
| `MANAGER_PORT` | manager | `3001` | Port the manager listens on. |
| `NUXT_MANAGER_URL` | web (server) | `http://127.0.0.1:3001` | Base URL of the manager. |
| `NUXT_MANAGER_SECRET` | web (server) | placeholder | Bearer secret sent to the manager. Must equal `MANAGER_SECRET`. |
| `NUXT_AUTH_USERS` | web (server) | `[]` | JSON array of `{ "username", "passwordHash" }` operators. Treat as a Secret. |
| `NUXT_AUTH_TRUST_PROXY` | web (server) | `false` | `true` behind the ingress: use `X-Forwarded-For` for the client IP. |
| `NUXT_AUTH_IDLE_TIMEOUT_MS` | web (server) | `1800000` | Idle session timeout (30 min). |
| `NUXT_AUTH_MAX_LIFETIME_MS` | web (server) | `43200000` | Absolute session lifetime (12 h). |
| `NUXT_AUTH_MAX_FAILURES` | web (server) | `5` | Failed sign-ins before a username or IP is locked. |
| `NUXT_AUTH_LOCKOUT_MS` | web (server) | `300000` | Lockout duration and failure-counting window (5 min). |
