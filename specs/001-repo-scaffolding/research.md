# Research: Repository Base Scaffolding

## Decisions

### Workspace and package manager
- **Decision**: pnpm workspace, `apps/web` + `apps/manager`.
- **Rationale**: pnpm already installed locally; native workspaces, fast, strict dependency
  resolution; Nuxt supports it first-class.
- **Alternatives**: npm workspaces (works, slower/looser); Turborepo/Nx (unneeded for 2 apps).

### Nuxt and Nuxt UI versions
- **Decision**: Nuxt 4 (current `4x` tag, 4.6.0 at planning time) and `@nuxt/ui` latest stable
  (`4.11.3`), pinned exactly in the lockfile.
- **Rationale**: Spec asks for Nuxt 4 with "latest LTS Nuxt UI". npm shows no separate `lts`
  dist-tag; `latest` (v4 line) is the supported stable release, so it is treated as the LTS
  line. The pin is recorded so the interpretation is auditable.
- **Alternatives**: Nuxt UI v3 (previous line; rejected, not latest).

### Back-end framework
- **Decision**: Fastify 5 with built-in pino logging, run via `tsx` in dev and compiled with
  `tsc` for start.
- **Rationale**: Minimal, TypeScript-friendly, structured logging built in (Principle V),
  `app.inject()` enables tests without sockets (Principle II).
- **Alternatives**: Express (no built-in typing/logging); Hono (fine, less ecosystem for process
  management); NestJS (over-engineered for scaffold).

### Service-to-service auth
- **Decision**: `Authorization: Bearer <MANAGER_SECRET>` checked in a Fastify `onRequest` hook
  for all routes with `crypto.timingSafeEqual`; missing/wrong returns 401. Secret required at
  startup (process exits if unset or shorter than 32 chars).
- **Rationale**: Satisfies FR-012 with minimal code; constant-time compare avoids timing leaks.
- **Alternatives**: mTLS or signed requests (heavier; revisit if manager leaves localhost).
- **Deferred**: secret rotation.

### Nuxt to manager relay
- **Decision**: Nitro route `GET /api/health` calls manager via a single `server/utils/manager.ts`
  helper (`$fetch` with 3 s timeout, Bearer header). Config in private `runtimeConfig`
  (`managerUrl`, `managerSecret`), mapped from `NUXT_MANAGER_URL` / `NUXT_MANAGER_SECRET`.
  Returns `{status: "healthy"|"unavailable"|"unauthorized"|"misconfigured"}`; never forwards
  URL, secret, or raw upstream errors to the client.
- **Rationale**: One choke point enforces Principle VI and FR-005/006/007.

### Testing
- **Decision**: Vitest in both apps; `@nuxt/test-utils` for the Nitro route (manager mocked via
  fetch stub); manager tested with `inject`.
- **Rationale**: Single runner; native TS.

### Linting
- **Decision**: ESLint flat config (`@nuxt/eslint` for web, `typescript-eslint` for manager);
  type-check via `nuxt typecheck` and `tsc --noEmit`.

### Ports and binding
- **Decision**: web dev on 3000, manager on 3001 bound to `127.0.0.1`; configurable by env.

## Unknowns resolved

All Technical Context items resolved; no NEEDS CLARIFICATION remain.
