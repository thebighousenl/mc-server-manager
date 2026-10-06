# Research: Web Front-End Authentication

## Session mechanism
- **Decision**: Server-side in-memory session map keyed by a 32-byte random token; cookie holds only the token (`HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/`).
- **Rationale**: Sign-out must invalidate immediately (FR-006) and sessions must not survive restart (clarification Q2). Both are natural for server-side memory and impossible for stateless signed cookies. No store dependency.
- **Alternatives**: h3 `useSession` sealed cookie (cannot be revoked, survives restarts); Redis/DB store (extra infra, contradicts Q2); `nuxt-auth-utils` (new dependency for little gain).

## Credential storage
- **Decision**: Operators supplied via server-only runtime config (`NUXT_AUTH_USERS`, JSON array of `{username, passwordHash}`), hashes in `scrypt$<saltB64>$<hashB64>` format using `node:crypto.scrypt`; compared with `timingSafeEqual`. A helper script prints a hash for a chosen password. Unknown users still run a dummy scrypt to equalise timing.
- **Rationale**: Matches clarification Q1 (admin-provisioned in deployment config); in a cluster this is a Secret-backed env var. Native crypto, no bcrypt/argon dependency.
- **Alternatives**: bcrypt/argon2 packages (new native dep); plaintext passwords in env (rejected, FR-005); database (out of scope).

## Throttling
- **Decision**: In-memory counters keyed separately by lower-cased username and by client IP; 5 failures within the window locks that key for 5 minutes (configurable); success clears the username counter. Locked attempts are rejected before password check, with the same generic response shape plus HTTP 429.
- **Rationale**: Resolves the deferred "per account or per source" question: both. Per-account stops guessing from many IPs; per-IP stops one source trying many usernames. Accepted trade-off: someone can lock a known username out for 5 minutes.
- **Alternatives**: Per-IP only (credential stuffing across IPs); external rate limiter (dependency).

## Client IP behind the ingress
- **Decision**: New config `auth.trustProxy` (`NUXT_AUTH_TRUST_PROXY`, default `false`). Handlers use `getRequestIP(event, { xForwardedFor: trustProxy })`. In the cluster it MUST be `true`; otherwise all operators share the proxy IP and per-IP lockout would block everyone.
- **Rationale**: Trusting forwarded headers when directly exposed would let clients spoof their IP, so it is opt-in.

## Testing pattern
- **Decision**: Auth logic lives in pure functions taking `(input, { config, now })`; handlers and middleware are thin adapters. Unit tests run in a node environment with a fake clock; adapters are verified through the quickstart walkthrough.
- **Rationale**: Nitro auto-imports (`useRuntimeConfig`, `readBody`, ...) are unavailable in plain node tests, and parallel agents need one shared pattern.

## CSRF
- **Decision**: `SameSite=Strict` cookie plus server-side `Origin` header check on every non-GET/HEAD `/api/**` request (must match request host).
- **Rationale**: Two independent layers, no token plumbing in the client.
- **Alternatives**: Double-submit tokens (more code, same protection here).

## Route gating
- **Decision**: Nitro server middleware for `/api/**` (authoritative) plus a Nuxt global route middleware for UX redirects. Public: `POST /api/auth/login`, `GET /api/health`, and the `/login` page. Unconfigured users list = nobody can sign in, so everything stays locked (fail closed, FR-014); a startup plugin logs an error.
- **Rationale**: Principle VI: Nuxt server layer is the single place for auth. UI redirect alone is not security.

## Health endpoint
- **Decision**: Keep `GET /api/health` public. It only returns the coarse back-end status already shipped (`healthy`/`unavailable`/...), no URL, secret, server or operator data, so FR-013 holds. The dashboard badge keeps working after sign-in.
- **Alternatives**: Gate it (breaks platform probes); reduce to `{status:'ok'}` (loses the back-end badge for probes, can be done later).

## Audit logging
- **Decision**: One JSON line per event to stdout (`event`, `username`, `ip`, `ts`, `level`), events: `login_success`, `login_failure`, `login_locked`, `logout`, `session_expired`. Never log passwords or tokens. Per clarification Q3, cluster logs only.

## Single-replica assumption
- In-memory sessions and counters are per process. Plan assumes one web replica; scaling out would need sticky sessions or a shared store (out of scope, noted in quickstart).

## Defaults
- Idle timeout 30 min, absolute lifetime 12 h, lockout 5 failures / 5 min, session sweep on access (lazy expiry, no timers).
