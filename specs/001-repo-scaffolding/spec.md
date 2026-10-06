# Feature Specification: Repository Base Scaffolding

**Feature Branch**: `001-repo-scaffolding`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "As a developer, I want to have the base scaffolding of the repository standing. 1. The front-end should be a Nuxt 4 app with the latest lts nuxt ui. The back-end, that will manage the MC servers, will be done in typescript (seperate process)."

## Clarifications

### Session 2026-10-06

- Q: Should the back-end require a shared secret from the Nuxt server layer on every request, including the health check? → A: Yes, every request; missing or wrong secret returns 401, health check included.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the front-end locally (Priority: P1)

A developer clones the repository, installs dependencies, and starts the web front-end. They see a
working starter page rendered with the project's chosen UI component library, proving the
front-end toolchain and styling are wired up.

**Why this priority**: The front-end is what users see; a running shell is the foundation every
later UI feature builds on.

**Independent Test**: On a fresh clone, follow the README to install and start the front-end;
open the printed local address and confirm the starter page renders with styled UI components.

**Acceptance Scenarios**:

1. **Given** a fresh clone with required tooling installed, **When** the developer installs
   dependencies and starts the front-end, **Then** it serves a starter page with no errors.
2. **Given** the front-end is running, **When** the developer edits the starter page, **Then**
   the change appears in the browser without a manual restart.

---

### User Story 2 - Run the back-end as a separate process (Priority: P1)

A developer starts the back-end that will manage Minecraft servers as its own process,
independent from the front-end. It exposes a basic health check so other parts can confirm it is
alive.

**Why this priority**: The back-end is a distinct deliverable; it must run on its own for the
architecture (separate processes) to hold.

**Independent Test**: Start only the back-end and request its health check with the shared
secret; it reports healthy while the front-end is not running. Without the secret it is rejected.

**Acceptance Scenarios**:

1. **Given** a fresh clone, **When** the developer starts only the back-end, **Then** it runs
   and its health check reports healthy.
2. **Given** the back-end is running, **When** the front-end is stopped or restarted, **Then**
   the back-end is unaffected.
3. **Given** the back-end is running, **When** a request arrives without the correct shared
   secret, **Then** it is rejected as unauthorized, including for the health check.

---

### User Story 3 - Front-end reaches back-end only via its server layer (Priority: P2)

A developer runs both processes together and sees the front-end display the back-end's health
status. The browser never contacts the back-end directly; the front-end's own server layer relays
the request internally (per the constitution's gateway principle).

**Why this priority**: Proves the end-to-end wiring and the security boundary early, before
real features depend on it.

**Independent Test**: Start both processes; the starter page shows "back-end healthy". Inspect
browser network traffic and confirm requests go only to the front-end's origin.

**Acceptance Scenarios**:

1. **Given** both processes are running, **When** the starter page loads, **Then** it shows the
   back-end health status.
2. **Given** the back-end is stopped, **When** the starter page loads, **Then** it shows a clear
   "back-end unavailable" state instead of crashing.
3. **Given** both are running, **When** browser network traffic is inspected, **Then** no
   request targets the back-end's address or exposes its URL or credentials.

---

### User Story 4 - Verify code quality with one command (Priority: P3)

A developer runs a single set of commands to lint, type-check, and run tests across both
projects, each with at least one passing sample test.

**Why this priority**: Enables the constitution's test-first and CI gates from the first
feature.

**Independent Test**: Run the documented check commands on a fresh clone; all pass.

**Acceptance Scenarios**:

1. **Given** a fresh clone with dependencies installed, **When** the developer runs the check
   commands, **Then** lint, type-check, and tests pass for both front-end and back-end.

### Edge Cases

- Shared secret missing or mismatched between front-end and back-end: back-end rejects the
  request and the front-end shows a clear "back-end unauthorized" state.
- Back-end address not configured: front-end server layer reports a clear configuration error
  rather than failing silently.
- Required tooling version too old: install/start fails with a message naming the minimum
  supported version.
- Port already in use: the process reports which port conflicted.
- Back-end slow or unresponsive: the front-end shows an unavailable state after a bounded wait.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Repository MUST contain two independently runnable projects: a web front-end and a
  back-end for managing Minecraft servers, each started separately.
- **FR-002**: The front-end MUST be a Nuxt 4 application using the latest LTS release of Nuxt UI
  as its component library.
- **FR-003**: The back-end MUST be a TypeScript (strict mode) process, separate from the
  front-end process.
- **FR-004**: The back-end MUST expose a health check reporting its status.
- **FR-005**: The front-end's Nuxt server layer MUST be the only path from front-end code to the
  back-end; the browser MUST NOT contact the back-end directly.
- **FR-006**: The back-end address and the shared secret MUST be supplied via server-side
  configuration only and MUST NOT be exposed to the browser.
- **FR-012**: The back-end MUST reject every request, including the health check, that lacks the
  correct shared secret, responding as unauthorized; the front-end's server layer MUST send the
  secret on every back-end request.
- **FR-007**: The front-end MUST display the back-end health status on a starter page and show a
  clear unavailable state when the back-end cannot be reached.
- **FR-008**: Each project MUST provide documented commands to install, start in development,
  lint, type-check, and test.
- **FR-009**: Each project MUST include at least one passing sample test.
- **FR-010**: Repository MUST include a README documenting prerequisites, setup, and how to run
  both processes together.
- **FR-011**: Repository MUST provide an example environment file listing all required settings
  without real secrets, and MUST ignore real environment files and build output in version
  control.

### Key Entities

- **Front-end project**: The web application and its server layer; owns UI and the
  relay to the back-end.
- **Back-end project** (the `manager` app): The process that will manage Minecraft servers; for now exposes only
  health status.
- **Health status**: Whether the back-end is reachable and operating; shown to the developer on
  the starter page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with prerequisites installed can go from fresh clone to both processes
  running in under 10 minutes using only the README.
- **SC-002**: 100% of lint, type-check, and test commands pass on a fresh clone for both
  projects.
- **SC-003**: The starter page shows the correct back-end status (healthy or unavailable) within
  5 seconds of loading.
- **SC-004**: Zero browser requests target the back-end directly during a full page load.
- **SC-005**: Stopping or restarting one process leaves the other running with no manual
  intervention.

## Assumptions

- Developers have a current Node.js LTS runtime and a package manager installed.
- "Latest LTS Nuxt UI" means the newest Nuxt UI release line designated long-term-supported at
  implementation time; the exact version is pinned in the plan.
- Both projects live in this single repository; workspace tooling choice is left to planning.
- Real Minecraft server management, authentication, and UI beyond a starter page are out of
  scope here and covered by later features.
- Local development only; production deployment and CI pipelines are out of scope.
