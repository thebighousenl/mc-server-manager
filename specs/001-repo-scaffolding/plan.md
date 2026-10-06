# Implementation Plan: Repository Base Scaffolding

**Branch**: `001-repo-scaffolding` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-repo-scaffolding/spec.md`

## Summary

Stand up a pnpm workspace with two separate processes: a Nuxt 4 + Nuxt UI web app (`apps/web`)
and a strict-TypeScript Fastify service (`apps/manager`) that will manage Minecraft servers. The
manager exposes only an authenticated `GET /health`. The web app's Nitro server layer relays
health status internally using a server-only URL and shared secret; the browser only talks to
its own origin. Both projects ship lint, type-check, and a sample Vitest test.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node.js 24 LTS (pinned in `.nvmrc` and `engines`)

**Primary Dependencies**: Nuxt 4.x, `@nuxt/ui` 4.x (latest stable line, currently 4.11.3);
Fastify 5 for manager. See [research.md](research.md)

**Storage**: N/A

**Testing**: Vitest in both projects (`@nuxt/test-utils` for web server routes)

**Target Platform**: Local development on macOS/Linux; deployment out of scope

**Project Type**: web application: front-end with server layer + separate back-end service

**Performance Goals**: Starter page shows health status within 5 seconds (SC-003)

**Constraints**: Browser never contacts manager (FR-005); manager URL and secret server-side only
(FR-006); every manager request needs the shared secret (FR-012)

**Scale/Scope**: 2 projects, 1 endpoint, 1 page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
|-----------|--------|------|
| I. Simplicity First | PASS | Two apps, one endpoint, no shared package or abstraction layers |
| II. Test-First | PASS | Sample tests written first per task; manager testable via Fastify `inject` |
| III. Safe Server Operations | PASS (n/a) | No destructive operations yet |
| IV. Security by Default | PASS | Secret required on all manager requests; manager binds `127.0.0.1` by default; secret never logged |
| V. Observability | PASS | Fastify structured (pino) logs with request ids; secret redacted |
| VI. Nuxt Server Layer as Sole Gateway | PASS | Only `server/api/*` in Nitro calls manager; config in private `runtimeConfig` |

Post-design re-check: PASS, no violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-repo-scaffolding/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── manager-api.yaml
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json              # root scripts: dev, lint, typecheck, test (delegate via pnpm -r)
pnpm-workspace.yaml
.nvmrc
.env.example              # MANAGER_URL, MANAGER_SECRET, MANAGER_PORT, MANAGER_HOST
.gitignore
README.md
apps/
├── manager/              # back-end process
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts      # reads config, starts server
│   │   ├── config.ts     # env parsing/validation (fails fast if secret missing)
│   │   ├── app.ts        # buildApp(): Fastify instance, auth hook, routes
│   │   └── routes/health.ts
│   └── tests/health.test.ts
└── web/                  # Nuxt 4 app
    ├── package.json
    ├── nuxt.config.ts    # modules: @nuxt/ui; private runtimeConfig
    ├── app/
    │   ├── app.vue       # UApp wrapper
    │   └── pages/index.vue
    ├── server/
    │   ├── api/health.get.ts
    │   └── utils/manager.ts   # single fetch helper adding secret + timeout
    └── tests/health.test.ts
```

**Structure Decision**: pnpm workspace with `apps/web` and `apps/manager`. No shared package
(nothing shared yet; Principle I). Root scripts run both processes and all checks.

## Complexity Tracking

No constitution violations; section intentionally empty.
