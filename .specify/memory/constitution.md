<!--
Sync Impact Report
Version change: 1.0.0 → 1.1.0
Modified principles: none renamed; IV. Security by Default unchanged
Added sections: Core Principle VI (Nuxt Server Layer as Sole Gateway)
Modified sections: Technical Constraints (architecture bullet now names Nuxt 4 server layer)
Removed sections: none
Deferred TODOs: none
-->
# MC Server Manager Constitution

## Core Principles

### I. Simplicity First
Every change MUST use the simplest solution that works. Features MUST NOT be built for
speculative needs; abstractions (interfaces, factories, config options) MUST have at least two
real call sites or a concrete requirement before they are introduced. Prefer the TypeScript/Node
standard library and already-installed dependencies over new ones. New dependencies MUST be
justified in the PR description.
Rationale: a small codebase is easier for a solo/small team to maintain and debug.

### II. Test-First (NON-NEGOTIABLE)
Non-trivial logic (server lifecycle, config parsing, backup/restore, auth) MUST have a failing
test written before the implementation. Red-Green-Refactor is enforced. Tests MUST run in CI and
MUST pass before merge. Process-control code MUST be testable without a real Minecraft server
(via a fake/stub process).
Rationale: lifecycle bugs corrupt worlds; tests are the cheapest safeguard.

### III. Safe Server Operations
Operations that can destroy or corrupt data (delete server, restore backup, overwrite world,
force-kill) MUST require explicit confirmation in the UI and API. Stop MUST attempt a graceful
shutdown (`save-all` then `stop`) before any forced kill. World data MUST be backed up before
destructive changes. All file paths derived from user input MUST be validated to stay inside the
managed servers directory.
Rationale: player worlds are irreplaceable user data.

### IV. Security by Default
The API and UI MUST require authentication; no unauthenticated control endpoints. Secrets
(RCON passwords, tokens) MUST NOT be committed, logged, or returned in API responses. Inputs
MUST be validated at the API boundary, and commands sent to a server console MUST be
authorized and never built by unescaped string concatenation into a shell. Services MUST bind
to localhost unless explicitly configured otherwise.
Rationale: the manager controls processes and files on the host.

### V. Observability
The backend MUST emit structured logs (level, timestamp, server id) and surface server console
output and lifecycle state changes to the UI in real time. Errors MUST include actionable
context and MUST NOT be silently swallowed.
Rationale: operators need to diagnose crashes without shell access.

### VI. Nuxt Server Layer as Sole Gateway
The Nuxt 4 server layer (`server/` routes and handlers) is the only bridge between the UI and
the back-end API that manages the cluster. The browser MUST NOT call the back-end API
directly; all front-end communication MUST go through Nuxt server routes over an internal,
secured channel. The back-end API's URL, credentials, and tokens MUST live only in server-side
runtime config (never `runtimeConfig.public`, never shipped to the client). Nuxt server routes
MUST authenticate/authorize each request, validate input, and return only the data the UI needs.
The back-end API MUST NOT be reachable from outside the internal network.
Rationale: one controlled trust boundary keeps cluster credentials off the client and gives a
single place for auth, validation, and auditing.

## Technical Constraints

- Language: TypeScript (strict mode) for backend and web UI; Node.js LTS runtime.
- Architecture: Nuxt 4 app (UI + server layer) in front of a separate back-end API that manages
  the cluster; the UI talks only to the Nuxt server layer, which talks to the back-end API
  (Principle VI).
- Configuration via environment variables or a config file; no hard-coded paths or ports.
- Persisted state MUST be recoverable after a manager restart (running servers are detected
  and re-attached or reported accurately).

## Development Workflow

- Work happens on feature branches; commits follow
  `type(application-part)[story-no]: description` (story number omitted on main branches).
- Every PR MUST pass lint, type-check, and tests, and be reviewed against this constitution.
- Complexity beyond Principle I MUST be justified in the PR or the plan's complexity table.

## Governance

This constitution supersedes other practices. Amendments require a PR that updates this file,
states the rationale and migration impact, and bumps the version: MAJOR for removed or
redefined principles, MINOR for added principles or materially expanded guidance, PATCH for
clarifications. All PRs and reviews MUST verify compliance; violations MUST be justified or
fixed before merge. Use `README.md` and `.specify/` artifacts for runtime guidance.

**Version**: 1.1.0 | **Ratified**: 2026-10-06 | **Last Amended**: 2026-10-06
