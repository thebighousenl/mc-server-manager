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
