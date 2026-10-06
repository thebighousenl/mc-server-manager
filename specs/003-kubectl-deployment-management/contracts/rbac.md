# Contract: Cluster permissions

The manager's kubeconfig identity (new Role/ServiceAccount, not the CI's `manifest-deployer`, which lacks delete, exec and logs) needs:

**Namespace `minecraft-servers`**

| Resource | Verbs |
|---|---|
| `deployments`, `deployments/scale` | get, list, watch, patch, create, delete |
| `pods`, `pods/log` | get, list, watch |
| `pods/exec` | create |
| `services`, `persistentvolumeclaims` | get, list, patch, create, delete |
| `ingressrouteudps` in API group `traefik.io` (as used by the repo) | get, list, patch, create, delete |
| `jobs.batch` | get, list, watch, create, delete |

**Namespace `kube-system`**: `helmchartconfigs.helm.cattle.io`, `resourceNames: [traefik]`, verbs get, update, patch.

Startup preflight: run `kubectl auth can-i` for each row; missing items appear in the manager health output and the affected actions return 403-style errors with the missing permission named.

Not granted: secrets, nodes, other namespaces, cluster-wide wildcards.

`patch` on services, persistentvolumeclaims and ingressrouteudps is needed for adoption (`kubectl label`); `watch` is needed by `kubectl wait` and `kubectl rollout status`.
