# Verification: Web Front-End Authentication (T035/T036)

Environment: Linux, Node 24.21 (the sandbox default is Node 22, so Node 24 was installed locally), no browser, manager app not running (so the dashboard badge shows "Back-end unavailable", which is expected).

## T035: automated checks
`pnpm lint && pnpm typecheck && pnpm test` from the repo root: all pass (web: 12 files / 112 tests, manager: 2 files / 9 tests).

## T036: quickstart walkthrough
Run against `pnpm exec nuxt dev` with `NUXT_AUTH_IDLE_TIMEOUT_MS=5000`, `NUXT_AUTH_LOCKOUT_MS=10000`, `NUXT_AUTH_TRUST_PROXY=true`, using curl. Dev-mode error bodies include stack traces; a production build returns none (checked).

| # | Scenario | Result |
|---|---|---|
| 1 | Gate | Pass. `GET /` while signed out returns 302 to `/login?redirect=/`. `GET /api/auth/me`, `GET /api/servers`, and `POST /api/anything` return 401. `GET /api/health` returns 200. |
| 2 | Sign in | API pass: valid credentials return 200 and set the cookie. Wrong password and unknown user return the identical 401 `Invalid credentials`. Login with a foreign `Origin` returns 403 and malformed JSON returns 400. **Not checked:** the redirect to `/` and the badge in a real browser. The signed-in `GET /` renders "MC Server Manager" and "Sign out" in the SSR HTML. |
| 3 | Sign out | API pass: logout without an `Origin` returns 403, with `Origin` returns 204, and the old cookie replayed afterwards returns 401. **Not checked:** the Back button and the `/login` redirect in a browser. |
| 4 | Expiry | Pass. With a 5 s idle timeout, `me` returns 200 before and 401 after a 6 s wait. `session_expired` is logged. **Not checked:** the browser reload redirect. |
| 5 | Lockout | Pass. After 5 wrong attempts the 6th returns 429 with `Retry-After: 10` even with the correct password. Sign-in works again after the lockout. |
| 6 | Fail closed | Pass. With `NUXT_AUTH_USERS` unset, the startup log has `{"level":"error","event":"no_operators_configured"}` and login returns 401. |
| 7 | Restart | Pass. A cookie from before the restart returns 401. |
| 8 | Redirect safety | Unit-tested (`redirect.test.ts`). **Not checked in a browser:** `/login?redirect=https://evil.example`. |
| 9 | Logs | Pass. `login_success`, `login_failure`, `login_locked`, `logout` and `session_expired` appear as JSON lines. Grepping the dev log for the password, `scrypt$` and `mc_session` finds nothing. |

### Additional checks
- **Cookie flags**:
  - Dev build: `mc_session=…; Path=/; HttpOnly; SameSite=Strict`.
  - Production build (`pnpm build`, `node .output/server/index.mjs`): `HttpOnly; Secure; SameSite=Strict`.
- **`X-Forwarded-For` lockout separation** (`NUXT_AUTH_TRUST_PROXY=true`):
  - 5 failures from `7.7.7.7` against different usernames lock that IP: `bob` from `7.7.7.7` returns 429, while `bob` from `8.8.8.8` returns 401.
  - The log records the forwarded IP.
  - Username lockout applies across IPs: `alice` from `9.9.9.9` returns 429 while `alice` is locked.
  - **Not checked:** `trustProxy=false` ignoring the header, which is only covered by `getRequestIP` semantics.
- **Time to dashboard (SC-002)**, production build, server-side only: login POST 0.08 s, authenticated SSR `GET /` 0.12 s, `GET /api/health` 0.007 s. This is far below the 30 s target. Browser-rendered timing was not measured.

### Notes
- Nuxt prints `WARN Duplicated imports "getSession"` because the `getSession` required by T008 shadows the h3 auto-import of the same name. The util takes precedence and nothing else uses h3's.
- `NUXT_AUTH_USERS='[...]'` is parsed by Nitro into an array before it reaches the app, so `getAuthConfig()` re-serialises it to the JSON-string contract.
- The `Origin` check compares against the request `Host` header, so the ingress must pass the original `Host` through.
