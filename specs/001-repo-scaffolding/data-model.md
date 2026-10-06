# Data Model: Repository Base Scaffolding

No persisted data. Only transient shapes:

## HealthStatus (manager response)
| Field | Type | Notes |
|-------|------|-------|
| status | `"ok"` | Present only when healthy |
| uptimeSeconds | number | Process uptime |

## WebHealth (web `/api/health` response)
| Field | Type | Notes |
|-------|------|-------|
| status | `"healthy" \| "unavailable" \| "unauthorized" \| "misconfigured"` | Derived from relay outcome |

### Mapping (web)
| Relay outcome | status |
|---------------|--------|
| 200 from manager | healthy |
| 401 from manager | unauthorized |
| network error / timeout / 5xx | unavailable |
| URL or secret not configured | misconfigured |

## Configuration (not persisted)
| Setting | Owner | Rule |
|---------|-------|------|
| MANAGER_SECRET | manager | Required, >= 32 chars |
| MANAGER_HOST / MANAGER_PORT | manager | Default `127.0.0.1` / `3001` |
| NUXT_MANAGER_URL | web (server only) | Required |
| NUXT_MANAGER_SECRET | web (server only) | Required; equals MANAGER_SECRET |
