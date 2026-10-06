# Contract: Auth API (Nuxt server routes)

Session cookie: `mc_session` (opaque token, `HttpOnly; SameSite=Strict; Path=/; Secure` in production).
All non-GET/HEAD requests must carry an `Origin` matching the host, else `403`.
Errors are `{ "statusMessage": string }`; messages never reveal which credential was wrong.

## POST /api/auth/login (public)
Request: `{ "username": string, "password": string }` (JSON, each ≤ 256 chars)

| Status | Meaning |
|---|---|
| 200 | `{ "username": string }`; sets `mc_session` |
| 400 | Malformed or oversized body |
| 401 | `Invalid credentials` (unknown user or wrong password) |
| 429 | `Too many attempts`; sets `Retry-After` seconds |

## POST /api/auth/logout
Deletes the session and clears the cookie. `204` always (also when already signed out).

## GET /api/auth/me
`200 { "username": string }` with a valid session; `401` otherwise. Used by the route middleware.

## GET /api/health (public)
Unchanged: `200 { "status": "healthy" | "unavailable" | "unauthorized" | "misconfigured" }`.

## All other /api/**
`401 Unauthorized` without a valid session; no body data. A valid request refreshes the idle timer.

## Pages
- `/login` public; accepts `?redirect=/path`. Only same-app paths starting with a single `/` are honoured; everything else falls back to `/`.
- Every other page redirects to `/login?redirect=<original path>` when `GET /api/auth/me` returns 401.
