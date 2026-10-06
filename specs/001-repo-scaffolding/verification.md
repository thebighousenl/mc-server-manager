# Verification report: repo scaffolding (T023-T027)

Run on origin/main @ 66de68a with Node v24.21.0, pnpm 10.34.6. No code or README changes were needed.

| Task | Check | Result |
|---|---|---|
| #23 | `pnpm lint`, `pnpm typecheck`, `pnpm test` (all `pnpm -r`) | All exit 0. Injected a type error in `apps/manager`: `pnpm typecheck` exited 2, so failures propagate. |
| #24 | `pnpm test` | manager: 2 files / 9 tests passed. web: 2 files / 15 tests passed (FR-009). |
| #25 | README vs task text | Prereqs, setup, run, checks, architecture note and env var table are all present. Table matches `.env.example` (5 vars). |
| #26 | quickstart scenarios 1-4 | See below. No deviations. |
| #27 | `pnpm --filter web build`, grep `apps/web/.output/public` for `MANAGER_SECRET`, `managerSecret`, `127.0.0.1:3001`, `localhost:3001` | 0 matches. |

## Quickstart scenarios
1. Web alone: page shows "Back-end unavailable"; `/api/health` returns `{"status":"unavailable"}`.
2. Manager alone: with bearer, `200 {"status":"ok","uptimeSeconds":...}`; without it, `401 {"error":"unauthorized"}`.
3. Wired: page shows "Back-end healthy". After stopping the manager, `/api/health` returns `unavailable`. With a mismatched `NUXT_MANAGER_SECRET`, `/api/health` returns `unauthorized` and the page shows "Back-end unauthorized". The browser only talks to :3000 (the manager URL is absent from the built client output).
4. Checks: see #23.

## Notes
- Not exercised: the quickstart's browser devtools Network tab and console-error checks. I used curl and the SSR HTML, and checked for same-origin requests via the build-output grep only.
- `nuxt typecheck` logs a non-fatal `ERR_PACKAGE_PATH_NOT_EXPORTED` for `vue-router/volar/sfc-route-blocks` (vue-language-core plugin resolution) but exits 0.
- The host default Node was v22, below the `engines` requirement (>=24). I ran with Node 24 from npm.
