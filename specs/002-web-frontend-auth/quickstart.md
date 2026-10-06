# Quickstart: Validate Web Front-End Authentication

## Prerequisites
- `pnpm install`, `.env` created from `.env.example`.
- Generate an operator hash: `printf %s '<password>' | pnpm --filter web hash-password`.
- Add to `.env`: `NUXT_AUTH_USERS='[{"username":"alice","passwordHash":"<hash>"}]'`

## Automated
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Manual scenarios (`pnpm dev`, http://localhost:3000)
1. **Gate (US1/US2)**: signed out, open `/` → redirected to `/login?redirect=/`. `curl -i localhost:3000/api/auth/me` → 401. `curl localhost:3000/api/health` → 200.
2. **Sign in**: valid credentials → lands on `/`, badge visible. Wrong password and unknown user show the same message.
3. **Sign out (US3)**: click sign out → `/login`; Back button shows login again; old cookie replayed with curl → 401.
4. **Expiry**: start with `NUXT_AUTH_IDLE_TIMEOUT_MS=5000`, wait, reload → login.
5. **Lockout (US4)**: 5 wrong attempts → 6th returns 429 even with correct password; works after `NUXT_AUTH_LOCKOUT_MS` (set to 10000 for testing).
6. **Fail closed**: unset `NUXT_AUTH_USERS`, restart → startup error logged, nobody can sign in.
7. **Restart**: restart dev server → previous cookie is rejected.
8. **Redirect safety**: `/login?redirect=https://evil.example` → after sign-in lands on `/`.
9. **Logs**: sign-in success/failure/logout appear as JSON lines without passwords or tokens.

Note: assumes a single web replica; sessions are per process.
