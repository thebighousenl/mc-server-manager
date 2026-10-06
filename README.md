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
printf %s '<password>' | pnpm --filter web hash-password   # prints scrypt$<salt>$<hash>; stdin keeps it out of shell history
# then in the repo-root .env (paste the hash as-is; keep the single quotes):
NUXT_AUTH_USERS='[{"username":"alice","passwordHash":"<hash>"}]'
```

`pnpm dev` / `pnpm --filter web dev` / `pnpm --filter manager dev` read the repo-root `.env` (the web dev script passes
`--dotenv ../../.env`, the manager's passes `--env-file-if-exists=../../.env`); restart the dev server after editing it. A `.env` in `apps/web` is **not** read by `dev`, and a variable already
exported in your shell wins over the `.env` value (neither loader overrides), so `unset NUXT_AUTH_USERS` if edits seem ignored.
Production builds read real environment variables only. If login fails for valid
credentials, check the server log for `no_operators_configured`.

Sessions and lockout counters live in process memory: restarting the web app signs everyone out, and
**only a single web replica is supported**. In the cluster, supply `NUXT_AUTH_USERS` from a Secret
and set `NUXT_AUTH_TRUST_PROXY=true` behind the ingress so the lockout sees real client IPs (leave it
`false` when the app is directly exposed, otherwise clients can spoof `X-Forwarded-For`).

The session cookie is `Secure` in production builds, so the app must be served over HTTPS (the
ingress terminates TLS); over plain HTTP the browser drops the cookie and sign-in appears to loop.
`Origin` is checked against the request `Host`, so the ingress must pass the original `Host` through.

Lockout trade-offs: 5 failures lock a username (from any IP) and, separately, the client IP for
`NUXT_AUTH_LOCKOUT_MS`. This means anyone who knows a username can lock that operator out for the
cooldown, and without `NUXT_AUTH_TRUST_PROXY=true` behind a proxy all clients share one IP and 5
failures lock everybody out.

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
