# Feature Specification: Web Front-End Authentication

**Feature Branch**: `002-web-frontend-auth`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "I want authentication for the front-end so we can securely manage our minecraft servers within the cluster from the front-end public url"

## Clarifications

### Session 2026-10-06

- Q: How should operators prove who they are when signing in? → A: Local username and password accounts, set up by an administrator in deployment configuration
- Q: When the front-end restarts or is redeployed, should signed-in operators stay signed in? → A: No, everyone signs in again
- Q: Where should an administrator review sign-in activity? → A: Structured entries in the front-end's cluster logs; no in-app page

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in to reach the management UI (Priority: P1)

An authorized operator opens the public front-end URL. Because they are not signed in, they see a sign-in page instead of any server information. After entering valid credentials they land on the server management UI and can manage the Minecraft servers.

**Why this priority**: The front-end is exposed on a public URL; without a sign-in gate anyone on the internet could control the servers. This alone makes the deployment safe to expose.

**Independent Test**: Visit the public URL in a fresh browser: only the sign-in page is shown. Sign in with valid credentials: the management UI loads and server data is visible.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in, **When** they open any page of the front-end, **Then** they are redirected to the sign-in page and no server data is shown.
2. **Given** the sign-in page, **When** the operator submits valid credentials, **Then** they are taken to the page they originally requested (or the home page) and can use the UI.
3. **Given** the sign-in page, **When** someone submits invalid credentials, **Then** they see a generic "invalid credentials" message that does not reveal which part was wrong, and remain signed out.

---

### User Story 2 - Block unauthenticated access to all management actions (Priority: P1)

Every action that reads or changes server state (list, start, stop, console, and the like) is refused unless the request comes from a signed-in operator, regardless of whether it is made through the UI or directly against the public URL.

**Why this priority**: A sign-in page alone is not security if the underlying actions can still be called directly.

**Independent Test**: Without signing in, request each management endpoint on the public URL directly; all are refused. After signing in, the same requests succeed.

**Acceptance Scenarios**:

1. **Given** no valid session, **When** a management endpoint is requested directly, **Then** the request is refused with an "unauthorized" outcome and no data is returned.
2. **Given** a signed-in operator, **When** they use the UI to manage servers, **Then** the actions succeed.
3. **Given** the public health/status check used by the platform, **When** it is requested without a session, **Then** it still responds but exposes no server or operator details.

---

### User Story 3 - Sign out and session expiry (Priority: P2)

An operator can sign out explicitly, and sessions end on their own after a period of inactivity or a maximum lifetime, so an unattended browser does not leave the servers exposed.

**Why this priority**: Limits exposure from shared or forgotten devices; the system is usable without it but less safe.

**Independent Test**: Sign in, click sign out, then press Back or request a management page: the sign-in page is shown. Separately, let a session pass its limit and confirm the next action requires sign-in again.

**Acceptance Scenarios**:

1. **Given** a signed-in operator, **When** they choose sign out, **Then** the session ends and any management page requires sign-in again.
2. **Given** a session past its inactivity or maximum lifetime, **When** the operator performs an action, **Then** they are sent to the sign-in page and, after signing in, returned to where they were.

---

### User Story 4 - Resist credential guessing (Priority: P2)

Repeated failed sign-in attempts are slowed or temporarily blocked so the public sign-in page cannot be used to brute-force credentials.

**Why this priority**: The sign-in page is internet-facing, so guessing attacks are expected.

**Independent Test**: Submit many wrong credentials in quick succession; further attempts are throttled or locked out, and valid credentials work again after the lockout window.

**Acceptance Scenarios**:

1. **Given** repeated failed attempts from the same source or for the same account, **When** the threshold is exceeded, **Then** further attempts are rejected for a cooldown period, even with correct credentials.
2. **Given** the cooldown has elapsed, **When** the operator signs in with valid credentials, **Then** sign-in succeeds.

---

### Edge Cases

- Session expires while a long-running view (such as a live console) is open: the view stops receiving data and the operator is prompted to sign in again, without leaking data after expiry.
- Operator opens a deep link while signed out: after sign-in they are returned to that link, and only to links within the front-end (no redirect to external sites).
- Credentials are missing or the authentication configuration is absent or invalid at startup: the front-end refuses to serve management features rather than falling back to open access.
- Concurrent sessions from several devices for the same operator: each is independent and sign-out affects only that session.
- Sign-in requests with malformed or oversized input are rejected cleanly without errors that reveal internals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require a signed-in session for every front-end page except the sign-in page.
- **FR-002**: System MUST require a valid session for every front-end server route that reads or changes server state, and refuse unauthenticated requests without returning any data.
- **FR-003**: System MUST let an operator sign in with credentials and show a generic failure message that does not reveal which credential was wrong.
- **FR-004**: System MUST allow only local username-and-password operator accounts, provisioned by an administrator in deployment configuration, to sign in; there is no public self-registration and no external identity provider.
- **FR-005**: Operator credentials MUST be stored only in protected form and MUST NOT be exposed to the browser, written to logs, or returned in any response.
- **FR-006**: System MUST let an operator sign out, immediately invalidating that session.
- **FR-007**: System MUST expire sessions after a configurable inactivity period and a configurable maximum lifetime. Sessions do not survive a front-end restart or redeploy; all operators must sign in again.
- **FR-008**: Session credentials held by the browser MUST NOT be readable by page scripts and MUST only be sent over secure connections when served on the public URL.
- **FR-009**: System MUST throttle or temporarily lock out repeated failed sign-in attempts.
- **FR-010**: System MUST protect state-changing requests against cross-site request forgery.
- **FR-011**: System MUST log sign-in successes, failures, sign-outs and lockouts with timestamp and operator identifier (never the password), to support auditing. These are emitted as structured entries in the front-end's cluster logs; no in-app audit page is provided.
- **FR-012**: After sign-in, the system MUST return the operator to the originally requested in-app page, and MUST ignore redirect targets outside the front-end.
- **FR-013**: The health/status endpoint used for platform monitoring MUST remain reachable without a session and MUST NOT expose server or operator information.
- **FR-014**: If authentication is not configured, the system MUST fail closed (deny management access) instead of allowing open access.
- **FR-015**: Browser-to-back-end communication MUST continue to pass only through the front-end's server layer; adding authentication MUST NOT expose the back-end or its credentials to the browser.

### Key Entities

- **Operator**: A person authorized to manage the servers. Has an identifier, a protected credential, and an enabled/disabled state.
- **Session**: A period of authenticated access for one operator on one browser. Has a creation time, last activity time, expiry, and can be revoked by sign-out.
- **Sign-in Attempt**: A record of a try to authenticate, with outcome, time, and source, used for throttling and auditing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of management pages and actions on the public URL are refused when requested without a valid session (verified by testing every route).
- **SC-002**: An authorized operator can go from opening the public URL to seeing their servers in under 30 seconds.
- **SC-003**: After 5 consecutive failed attempts, further attempts are blocked for at least a minute, making more than a few dozen guesses per hour infeasible.
- **SC-004**: After sign-out, session expiry, or a front-end restart, 100% of subsequent management requests with the old session are refused.
- **SC-005**: Zero credentials or session secrets appear in logs, responses, or client-visible configuration in review and testing.
- **SC-006**: Every sign-in success, failure and sign-out is recorded in the front-end's cluster logs and findable by an administrator with log access.

## Assumptions

- A small team of operators (roughly under 10) manages the servers; all signed-in operators have the same full permissions. Role-based permissions are out of scope.
- Operator accounts are provisioned by an administrator through deployment configuration; self-registration, password reset by email, and an in-app user-management UI are out of scope for this feature.
- Authentication uses username and password with a server-side session; single sign-on, multi-factor authentication and social login are out of scope for a first version and may follow later.
- The public URL is served over HTTPS by the cluster ingress.
- The back-end manager API remains internal and keeps its existing shared-secret protection; this feature secures only the public front-end.
- Defaults: 30-minute inactivity timeout, 12-hour maximum session lifetime, lockout after 5 failed attempts for 5 minutes. All are adjustable.
