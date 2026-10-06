# Quickstart: Validate Kubernetes Minecraft Server Management

## Prerequisites
- `pnpm install`, `.env` from `.env.example`, a signed-in operator (feature 002).
- `kubectl` on PATH; kubeconfig for context `bighaus` (set `KUBECONFIG`/`KUBE_CONTEXT` in `.env` if not default), namespace `minecraft-servers` (`MC_NAMESPACE`).
- Permissions per [contracts/rbac.md](./contracts/rbac.md).
- Take a copy of every world before touching anything: this feature is validated first against a throwaway server, never first against the five. Until the manager can create servers (PR-17), hand-create `zz-test` from a copy of the OneDev repo's `servers/daan` overlay (rename everything, add only a spare `mc-zz-test` entry to the live Traefik HelmChartConfig via `kubectl -n kube-system get helmchartconfig traefik -o yaml`, never apply the repo copy; Traefik restarts, interrupting all HTTP ingress for a few seconds, now and when you remove the entry) for the lifecycle, console and settings checks, then delete it with `kubectl delete -k`.

## Automated (no cluster)
```bash
pnpm lint && pnpm typecheck && pnpm test
```
Covers lifecycle, settings validation, Traefik edit/preservation, adopt guards, delete guards and the gateway allow-list with a fake `kubectl`.

## Read-only cluster check
1. `kubectl -n minecraft-servers get deploy,svc,pvc,ingressrouteudp --show-labels` and confirm every object carries `app.kubernetes.io/name=bedrock` and `app.kubernetes.io/instance=<name>` as in the repo (record any difference).
2. Start `pnpm dev`, open `/servers`: five servers listed within 5 s (SC-001), state and ports match the README table (US1); change a pod state by hand and time how long the page takes to show it (SC-002, within 10 s).

## Throwaway server (create, operate, delete)
3. Create `zz-test` (US6, time it, SC-008): appears, reaches `running`, shows "open UDP <port>"; the five existing servers show no restart (`kubectl get pods` ages unchanged).
4. Console (US4): `list` returns a response in the panel within 3 s (time it, SC-006); Players tab matches.
5. Lifecycle (US3, time it, SC-005): stop (confirm) then start; logs show a clean quit on stop and the default termination grace period is enough (record the result in research.md decision 5).
6. Settings (US5): change `MAX_PLAYERS`, confirm restart, value in effect, restart again, still in effect (SC-007).
7. Delete (US7): wrong typed name refused; correct name always produces an export file first, downloadable from `/api/exports`; objects and the Traefik `mc-zz-test` entry are gone, other entries intact.

## Adoption and protection (only after the above passes)
8. For each existing server: adopt with `confirm:false` shows only label additions; adopt for real; check `kubectl get pods` UIDs and ages unchanged and players stay connected (SC-003).
9. Try `DELETE /api/servers/daan` (and each of the five) -> 403; also with the `mc-manager/protected` label removed by hand -> still 403 (SC-004).
10. Disable the OneDev "deploy servers" job for adopted servers before relying on the manager.

## Security spot checks
- `curl localhost:3000/api/servers` without a cookie -> 401.
- Browser responses and manager logs contain no kubeconfig content, bearer secret or raw `kubectl` stderr with credentials (SC-010).
