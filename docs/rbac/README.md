# Manager RBAC

Apply, then build a kubeconfig for the `mc-manager` ServiceAccount (for example with `kubectl create token`):

```bash
kubectl apply -f docs/rbac/mc-manager-role.yaml
```

Secrets, nodes, other namespaces and cluster-wide wildcards are deliberately not granted.

## Check

Run each line as the ServiceAccount; every one must print `yes`.

```bash
SA=system:serviceaccount:minecraft-servers:mc-manager
N="-n minecraft-servers --as $SA"
kubectl auth can-i $N get,list,watch,patch,create,delete deployments.apps
kubectl auth can-i $N patch deployments.apps --subresource=scale
kubectl auth can-i $N get,list,watch pods
kubectl auth can-i $N get pods --subresource=log
kubectl auth can-i $N create pods --subresource=exec
kubectl auth can-i $N get,list,patch,create,delete services
kubectl auth can-i $N get,list,patch,create,delete persistentvolumeclaims
kubectl auth can-i $N get,list,patch,create,delete ingressrouteudps.traefik.io
kubectl auth can-i $N get,list,watch,create,delete jobs.batch
kubectl auth can-i -n kube-system --as $SA update helmchartconfigs.helm.cattle.io/traefik
kubectl auth can-i $N get secrets    # must print "no"
```
