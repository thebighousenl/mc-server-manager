# Cutover: retire the OneDev deploy job

Rule: the five servers (`gaitie`, `daan`, `kontgat`, `creative`, `plaskutje`) are never deleted, and worlds are never touched.

1. [ ] Apply `docs/rbac/mc-manager-role.yaml`; run the `docs/rbac/README.md` checks.
2. [ ] Adopt each of the five servers in the manager; verify each: labels applied, status correct, still protected, players can connect.
3. [ ] Disable the `deploy servers` job trigger in OneDev.
4. [ ] Confirm no deploy re-applies manifests (job history shows no new runs; objects unchanged after a manager restart).
5. [ ] Archive the OneDev repo read-only.
6. [ ] Rollback: re-enable the `deploy servers` job trigger (adopted labels are harmless to it).
