# Quickstart: Validate Repository Base Scaffolding

## Prerequisites
- Node.js 24 LTS (`.nvmrc`), pnpm

## Setup
```bash
pnpm install
cp .env.example .env     # set MANAGER_SECRET (>= 32 chars) and NUXT_MANAGER_SECRET to the same value
```

## Scenarios

1. **Front-end alone** (US1): `pnpm --filter web dev` → open http://localhost:3000; starter page
   renders styled; page shows "back-end unavailable".
2. **Back-end alone** (US2): `pnpm --filter manager dev`, then
   `curl -H "Authorization: Bearer $MANAGER_SECRET" localhost:3001/health` → `200 {"status":"ok",...}`;
   same call without header → `401`.
3. **Wired** (US3): `pnpm dev` (both) → starter page shows "back-end healthy". Browser devtools
   Network: only requests to localhost:3000. Stop manager → page shows unavailable. Change
   `NUXT_MANAGER_SECRET` → page shows unauthorized.
4. **Checks** (US4): `pnpm lint && pnpm typecheck && pnpm test` → all pass.

Contracts: [manager-api.yaml](contracts/manager-api.yaml), [web-api.yaml](contracts/web-api.yaml).
Data shapes: [data-model.md](data-model.md).
